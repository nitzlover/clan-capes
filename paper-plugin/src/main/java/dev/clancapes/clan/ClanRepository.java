package dev.clancapes.clan;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.panel.PanelClient;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import java.util.logging.Level;

/**
 * In-memory clan cache backed by the panel REST API.
 * <p>
 * Reads hit the in-memory map for free; the map is refreshed
 * wholesale on a periodic schedule (see {@link #refreshAsync}) and
 * also on demand after a write (Phase 2.3+).
 * <p>
 * Phase 2.1 ships this read-only. Mutating commands ({@code /clan
 * create}, invite, etc.) land in Phase 2.3 — they'll POST to the
 * panel and trigger an immediate refresh so subsequent in-memory
 * reads pick up the change without waiting for the schedule.
 * <p>
 * Coexists with the legacy {@link dev.clancapes.hook.PowerClansHook}
 * for now — neither has been wired into the plugin's hot paths yet,
 * so this PR is pure scaffolding. The cutover happens in Phase 2.5
 * when we replace every {@code PowerClansHook#getClanTag} call site.
 */
public final class ClanRepository {
    private final ClanCapesPlugin plugin;
    private final PanelClient panelClient;

    /** Tag → Clan. Replaced wholesale on every refresh. */
    private final AtomicReference<Map<String, Clan>> byTag =
            new AtomicReference<>(Map.of());

    /** Player UUID → Clan tag. Derived from {@link #byTag} on refresh. */
    private final AtomicReference<Map<UUID, String>> byPlayer =
            new AtomicReference<>(Map.of());

    public ClanRepository(ClanCapesPlugin plugin) {
        this.plugin = plugin;
        this.panelClient = new PanelClient(plugin);
    }

    /** Snapshot of every active clan (immutable). Empty list before the first refresh. */
    public List<Clan> all() {
        return List.copyOf(byTag.get().values());
    }

    /** Tag is case-insensitive; the cache stores upper-case keys. */
    public Optional<Clan> byTag(String tag) {
        if (tag == null) return Optional.empty();
        return Optional.ofNullable(byTag.get().get(tag.toUpperCase()));
    }

    public Optional<Clan> byPlayer(UUID uuid) {
        if (uuid == null) return Optional.empty();
        String tag = byPlayer.get().get(uuid);
        if (tag == null) return Optional.empty();
        return byTag(tag);
    }

    public int size() {
        return byTag.get().size();
    }

    /**
     * Async refresh — pulls the full clan list off the panel and
     * swaps both maps atomically. Logs failures at WARNING but keeps
     * the existing cache intact so transient panel outages don't
     * blank in-memory data for connected players.
     */
    public void refreshAsync(Runnable onDone) {
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            String panelUrl = plugin.getPluginConfig().getPanelUrl();
            String apiKey = plugin.getPluginConfig().getPanelApiKey();
            if (panelUrl == null || panelUrl.isBlank() || apiKey == null || apiKey.isBlank()) {
                // Not configured yet — nothing to refresh.
                if (onDone != null) onDone.run();
                return;
            }
            try {
                List<Clan> fresh = panelClient.fetchClans(panelUrl, apiKey);
                Map<String, Clan> tagMap = new HashMap<>(fresh.size() * 2);
                Map<UUID, String> playerMap = new HashMap<>();
                for (Clan c : fresh) {
                    String upper = c.tag().toUpperCase();
                    tagMap.put(upper, c);
                    for (ClanMember m : c.members()) {
                        playerMap.put(m.playerUuid(), upper);
                    }
                }
                byTag.set(Collections.unmodifiableMap(tagMap));
                byPlayer.set(Collections.unmodifiableMap(playerMap));
                if (plugin.getPluginConfig().isDebugLogging()) {
                    plugin.getLogger().info("[ClanRepository] refreshed: "
                            + tagMap.size() + " clan(s), "
                            + playerMap.size() + " member(s)");
                }
            } catch (PanelClient.PanelException e) {
                plugin.getLogger().log(Level.WARNING,
                        "[ClanRepository] refresh failed (keeping previous cache): " + e.getMessage());
            } finally {
                if (onDone != null) onDone.run();
            }
        });
    }
}
