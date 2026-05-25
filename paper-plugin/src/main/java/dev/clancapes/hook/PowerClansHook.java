package dev.clancapes.hook;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.config.PluginConfig;
import dev.clancapes.model.PowerClanEntry;
import org.bukkit.Bukkit;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.plugin.Plugin;

import java.io.File;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Reflective PowerClans integration with a {@code data.yml} fallback so clan
 * resolution still works when the PowerClans API signature differs or the
 * reflective lookup fails. Player→clan mapping is built from
 * {@code clans.<id>.leader|officers|members} indexed by UUID.
 */
public final class PowerClansHook {
    private final ClanCapesPlugin plugin;
    private final PluginConfig config;
    private Object powerClansApi;
    private Method getClanByPlayer;
    private Method getTag;
    private Method listClansMethod;
    private Method getNameMethod;

    /**
     * Set true once {@link #register} confirms PowerClans is present. Every
     * subsequent read path bails early when this is false so we never
     * touch the {@code refreshDataFileCache} bytecode (which references
     * {@link PowerClanEntry}) on a post-migration deploy where the
     * PowerClans plugin has been removed. Paper's PluginClassLoader on
     * 26.x has been seen to fail lazy class resolution of certain
     * model classes once the plugin's been running for a while, and
     * gating that whole code path eliminates the surface entirely.
     */
    private boolean available = false;

    // data.yml cache (rebuilt when mtime changes)
    private long cachedDataFileMtime = -1L;
    private Map<UUID, String> uuidToTag = Map.of();
    private List<PowerClanEntry> cachedEntries = List.of();

    public PowerClansHook(ClanCapesPlugin plugin) {
        this.plugin = plugin;
        this.config = plugin.getPluginConfig();
    }

    public void register() {
        if (!config.isPowerClansEnabled() || Bukkit.getPluginManager().getPlugin("PowerClans") == null) {
            plugin.getLogger().info("PowerClans not found — clan detection disabled");
            return;
        }
        available = true;
        try {
            Class<?> apiClass = Class.forName("me.clip.powerclans.api.PowerClansAPI");
            Method getApi = apiClass.getMethod("getInstance");
            powerClansApi = getApi.invoke(null);
            getClanByPlayer = apiClass.getMethod("getClanByPlayer", Player.class);
            Class<?> clanClass = Class.forName("me.clip.powerclans.objects.Clan");
            getTag = clanClass.getMethod("getTag");
            for (String methodName : List.of("getClans", "getAllClans")) {
                try {
                    listClansMethod = apiClass.getMethod(methodName);
                    break;
                } catch (NoSuchMethodException ignored) {
                    /* try next */
                }
            }
            try {
                getNameMethod = clanClass.getMethod("getName");
            } catch (NoSuchMethodException ignored) {
                try {
                    getNameMethod = clanClass.getMethod("getId");
                } catch (NoSuchMethodException ignored2) {
                    getNameMethod = null;
                }
            }
            plugin.getLogger().info("PowerClans hook enabled (API)");
        } catch (Exception e) {
            plugin.getLogger().warning("PowerClans API mismatch (" + e.getMessage()
                    + ") — falling back to data.yml lookup");
            powerClansApi = null;
        }
        // Warm the data.yml index so first command is fast and logs cluster at startup.
        refreshDataFileCache();
    }

    public Optional<String> getClanTag(UUID uuid) {
        if (uuid == null) {
            return Optional.empty();
        }
        if (!available) {
            // PowerClans plugin not installed — never touch the data.yml
            // cache (its bytecode references PowerClanEntry which Paper's
            // PluginClassLoader has been seen to lose track of post-init).
            return Optional.empty();
        }
        Player player = Bukkit.getPlayer(uuid);
        if (player != null) {
            Optional<String> viaApi = resolveViaApi(player);
            if (viaApi.isPresent()) {
                return viaApi;
            }
        }
        Optional<String> viaData = resolveViaDataFile(uuid);
        // Demoted to FINE — this fires on every PlaceholderAPI eval (TAB,
        // scoreboard, etc.) which flooded the server log when debug-logging
        // was on. Enable Paper's java.util.logging FINE level explicitly if
        // you actually want per-call traces.
        if (config.isDebugLogging()) {
            plugin.getLogger().fine("PowerClans data.yml lookup " + uuid
                    + " -> " + viaData.orElse("<none>"));
        }
        return viaData;
    }

    public Optional<String> getClanTag(Player player) {
        if (player == null) {
            return Optional.empty();
        }
        if (!available) {
            return Optional.empty();
        }
        Optional<String> viaApi = resolveViaApi(player);
        if (viaApi.isPresent()) {
            return viaApi;
        }
        Optional<String> viaData = resolveViaDataFile(player.getUniqueId());
        if (config.isDebugLogging()) {
            plugin.getLogger().fine("PowerClans data.yml lookup " + player.getName()
                    + "/" + player.getUniqueId() + " -> " + viaData.orElse("<none>"));
        }
        return viaData;
    }

    private Optional<String> resolveViaApi(Player player) {
        if (powerClansApi == null || getClanByPlayer == null) {
            return Optional.empty();
        }
        try {
            Object clan = getClanByPlayer.invoke(powerClansApi, player);
            if (clan == null) {
                return Optional.empty();
            }
            String tag = (String) getTag.invoke(clan);
            Optional<String> result = Optional.ofNullable(tag).map(t -> t.toUpperCase(Locale.ROOT));
            if (config.isDebugLogging() && result.isPresent()) {
                plugin.getLogger().fine("PowerClans API " + player.getName() + " -> " + result.get());
            }
            return result;
        } catch (Exception e) {
            plugin.getLogger().warning("PowerClans getClanByPlayer failed for "
                    + player.getName() + ": " + e.getMessage() + " — using data.yml");
            return Optional.empty();
        }
    }

    private Optional<String> resolveViaDataFile(UUID uuid) {
        refreshDataFileCache();
        if (uuid == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(uuidToTag.get(uuid));
    }

    /**
     * All clans from PowerClans API (if available) or {@code plugins/PowerClans/data.yml}.
     */
    public List<PowerClanEntry> listClans() {
        if (!available) {
            return List.of();
        }
        List<PowerClanEntry> fromApi = listClansFromApi();
        if (!fromApi.isEmpty()) {
            return fromApi;
        }
        refreshDataFileCache();
        return cachedEntries;
    }

    private List<PowerClanEntry> listClansFromApi() {
        if (powerClansApi == null || listClansMethod == null || getTag == null) {
            return List.of();
        }
        try {
            Object raw = listClansMethod.invoke(powerClansApi);
            if (raw == null) {
                return List.of();
            }
            List<PowerClanEntry> out = new ArrayList<>();
            if (raw instanceof Map<?, ?> map) {
                for (Object clan : map.values()) {
                    addClanFromApiObject(clan, out);
                }
            } else if (raw instanceof Collection<?> collection) {
                for (Object clan : collection) {
                    addClanFromApiObject(clan, out);
                }
            }
            out.sort(Comparator.comparing(PowerClanEntry::tag));
            return out;
        } catch (Exception e) {
            plugin.getLogger().fine("PowerClans listClans API failed: " + e.getMessage());
            return List.of();
        }
    }

    private void addClanFromApiObject(Object clan, List<PowerClanEntry> out) throws Exception {
        if (clan == null) {
            return;
        }
        String tag = (String) getTag.invoke(clan);
        if (tag == null || tag.isBlank()) {
            return;
        }
        String id = tag;
        if (getNameMethod != null) {
            Object name = getNameMethod.invoke(clan);
            if (name != null && !name.toString().isBlank()) {
                id = name.toString();
            }
        }
        String leader = "";
        try {
            Method getLeader = clan.getClass().getMethod("getLeader");
            Object leaderObj = getLeader.invoke(clan);
            if (leaderObj != null) {
                leader = leaderObj.toString();
            }
        } catch (NoSuchMethodException ignored) {
            /* optional */
        }
        int level = 1;
        try {
            Method getLevel = clan.getClass().getMethod("getLevel");
            Object levelObj = getLevel.invoke(clan);
            if (levelObj instanceof Number n) {
                level = n.intValue();
            }
        } catch (NoSuchMethodException ignored) {
            /* optional */
        }
        out.add(new PowerClanEntry(id, tag.toUpperCase(Locale.ROOT), leader, level));
    }

    private synchronized void refreshDataFileCache() {
        File dataFile = resolveDataFile();
        if (dataFile == null || !dataFile.isFile()) {
            if (cachedDataFileMtime != 0L) {
                plugin.getLogger().warning("PowerClans data.yml not found at "
                        + (dataFile == null ? "<unresolved>" : dataFile.getAbsolutePath())
                        + " — clan list empty");
                cachedDataFileMtime = 0L;
                uuidToTag = Map.of();
                cachedEntries = List.of();
            }
            return;
        }
        long mtime = dataFile.lastModified();
        if (mtime == cachedDataFileMtime) {
            return;
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(dataFile);
        ConfigurationSection section = yaml.getConfigurationSection("clans");
        if (section == null) {
            uuidToTag = Map.of();
            cachedEntries = List.of();
            cachedDataFileMtime = mtime;
            plugin.getLogger().warning("PowerClans data.yml has no 'clans' section");
            return;
        }
        Map<UUID, String> uuidIndex = new HashMap<>();
        List<PowerClanEntry> out = new ArrayList<>();
        for (String id : section.getKeys(false)) {
            String tag = section.getString(id + ".tag");
            if (tag == null || tag.isBlank()) {
                continue;
            }
            String tagUpper = tag.toUpperCase(Locale.ROOT);
            String leader = section.getString(id + ".leader", "");
            int level = section.getInt(id + ".level", 1);
            out.add(new PowerClanEntry(id, tagUpper, leader, level));

            addUuid(uuidIndex, leader, tagUpper);
            for (String officer : section.getStringList(id + ".officers")) {
                addUuid(uuidIndex, officer, tagUpper);
            }
            for (String member : section.getStringList(id + ".members")) {
                addUuid(uuidIndex, member, tagUpper);
            }
        }
        out.sort(Comparator.comparing(PowerClanEntry::tag));
        cachedEntries = List.copyOf(out);
        uuidToTag = Map.copyOf(uuidIndex);
        cachedDataFileMtime = mtime;
        plugin.getLogger().info("PowerClans data.yml indexed: " + out.size()
                + " clans, " + uuidIndex.size() + " members from "
                + dataFile.getAbsolutePath());
    }

    private static void addUuid(Map<UUID, String> index, String raw, String tag) {
        if (raw == null || raw.isBlank()) {
            return;
        }
        try {
            index.put(UUID.fromString(raw.trim()), tag);
        } catch (IllegalArgumentException ignored) {
            /* skip malformed uuid */
        }
    }

    private File resolveDataFile() {
        String custom = config.getPowerClansDataFile();
        if (custom != null && !custom.isBlank()) {
            return new File(custom);
        }
        Plugin powerClans = Bukkit.getPluginManager().getPlugin("PowerClans");
        if (powerClans != null) {
            return new File(powerClans.getDataFolder(), "data.yml");
        }
        File pluginsDir = plugin.getDataFolder().getParentFile();
        return new File(pluginsDir, "PowerClans/data.yml");
    }
}
