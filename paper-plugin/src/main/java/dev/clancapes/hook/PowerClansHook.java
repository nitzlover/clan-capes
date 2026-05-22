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
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Reflective PowerClans integration so the plugin builds without PowerClans on the classpath at runtime only.
 */
public final class PowerClansHook {
    private final ClanCapesPlugin plugin;
    private final PluginConfig config;
    private Object powerClansApi;
    private Method getClanByPlayer;
    private Method getTag;
    private Method listClansMethod;
    private Method getNameMethod;

    public PowerClansHook(ClanCapesPlugin plugin) {
        this.plugin = plugin;
        this.config = plugin.getPluginConfig();
    }

    public void register() {
        if (!config.isPowerClansEnabled() || Bukkit.getPluginManager().getPlugin("PowerClans") == null) {
            plugin.getLogger().info("PowerClans not found — clan detection disabled");
            return;
        }
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
            plugin.getLogger().info("PowerClans hook enabled");
        } catch (Exception e) {
            plugin.getLogger().warning("PowerClans API mismatch: " + e.getMessage());
            powerClansApi = null;
        }
    }

    public Optional<String> getClanTag(UUID uuid) {
        Player player = Bukkit.getPlayer(uuid);
        if (player == null) {
            return Optional.empty();
        }
        return getClanTag(player);
    }

    public Optional<String> getClanTag(Player player) {
        if (powerClansApi == null || getClanByPlayer == null) {
            return Optional.empty();
        }
        try {
            Object clan = getClanByPlayer.invoke(powerClansApi, player);
            if (clan == null) {
                return Optional.empty();
            }
            String tag = (String) getTag.invoke(clan);
            return Optional.ofNullable(tag).map(t -> t.toUpperCase(Locale.ROOT));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    /**
     * All clans from PowerClans API (if available) or {@code plugins/PowerClans/data.yml}.
     */
    public List<PowerClanEntry> listClans() {
        List<PowerClanEntry> fromApi = listClansFromApi();
        if (!fromApi.isEmpty()) {
            return fromApi;
        }
        return listClansFromDataFile();
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

    private List<PowerClanEntry> listClansFromDataFile() {
        File dataFile = resolveDataFile();
        if (dataFile == null || !dataFile.isFile()) {
            plugin.getLogger().warning("PowerClans data.yml not found — clan list empty for panel");
            return List.of();
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(dataFile);
        ConfigurationSection section = yaml.getConfigurationSection("clans");
        if (section == null) {
            return List.of();
        }
        List<PowerClanEntry> out = new ArrayList<>();
        for (String id : section.getKeys(false)) {
            String tag = section.getString(id + ".tag");
            if (tag == null || tag.isBlank()) {
                continue;
            }
            String leader = section.getString(id + ".leader", "");
            int level = section.getInt(id + ".level", 1);
            out.add(new PowerClanEntry(id, tag.toUpperCase(Locale.ROOT), leader, level));
        }
        out.sort(Comparator.comparing(PowerClanEntry::tag));
        plugin.getLogger().info("Loaded " + out.size() + " clans from PowerClans data.yml");
        return out;
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
