package dev.clancapes.clan;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.panel.PanelClient;

import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;

/**
 * Live operator settings pulled from the panel.
 *
 * Reads are lock-free (AtomicReference snapshot swap) so any hot
 * path — /clan create cooldown gate, future banner / palette checks —
 * pays a single getAndCheck per call. Refreshes happen on the same
 * 5-minute cadence as ClanRepository so a /dashboard/settings change
 * lands in-game within the next poll cycle. {@link #refreshAsync}
 * keeps the previous snapshot in place on a panel outage so an admin
 * tightening a value doesn't accidentally relax it when the panel
 * blips offline.
 */
public final class SettingsCache {
    /** Sensible plugin-side defaults — match {@code DEFAULT_SETTINGS} in settings-repo.ts. */
    private static final long DEFAULT_COOLDOWN_MS = TimeUnit.HOURS.toMillis(1);
    private static final int DEFAULT_BANNER_MAX_LAYERS = 6;

    private final ClanCapesPlugin plugin;
    private final AtomicReference<Snapshot> snapshot =
            new AtomicReference<>(new Snapshot(DEFAULT_COOLDOWN_MS, DEFAULT_BANNER_MAX_LAYERS));

    public SettingsCache(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    public long getCreateCooldownMs() {
        return snapshot.get().createCooldownMs;
    }

    public int getBannerMaxLayers() {
        return snapshot.get().bannerMaxLayers;
    }

    /**
     * Async pull from GET /api/plugin/settings. Failures keep the
     * previous snapshot in place and log at WARNING — settings drift
     * is far less surprising than the cooldown unexpectedly loosening
     * because the panel was momentarily unreachable.
     */
    public void refreshAsync(Runnable onDone) {
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            String panelUrl = plugin.getPluginConfig().getPanelUrl();
            String apiKey = plugin.getPluginConfig().getPanelApiKey();
            if (panelUrl == null || panelUrl.isBlank() || apiKey == null || apiKey.isBlank()) {
                if (onDone != null) onDone.run();
                return;
            }
            try {
                Map<String, Object> raw = new PanelClient(plugin)
                        .fetchSettings(panelUrl, apiKey);
                Object settingsObj = raw.get("settings");
                if (!(settingsObj instanceof Map<?, ?> settings)) {
                    if (onDone != null) onDone.run();
                    return;
                }
                long cooldown = longField(settings, "createCooldownMs", DEFAULT_COOLDOWN_MS);
                int maxLayers = intField(settings, "bannerMaxLayers", DEFAULT_BANNER_MAX_LAYERS);
                snapshot.set(new Snapshot(cooldown, maxLayers));
                if (plugin.getPluginConfig().isDebugLogging()) {
                    plugin.getLogger().info("[SettingsCache] refreshed: cooldown="
                            + cooldown + "ms, bannerMaxLayers=" + maxLayers);
                }
            } catch (PanelClient.PanelException e) {
                plugin.getLogger().log(Level.WARNING,
                        "[SettingsCache] refresh failed (keeping previous): " + e.getMessage());
            } finally {
                if (onDone != null) onDone.run();
            }
        });
    }

    private static long longField(Map<?, ?> map, String key, long fallback) {
        Object v = map.get(key);
        if (v instanceof Number n) return n.longValue();
        return fallback;
    }

    private static int intField(Map<?, ?> map, String key, int fallback) {
        Object v = map.get(key);
        if (v instanceof Number n) return n.intValue();
        return fallback;
    }

    private record Snapshot(long createCooldownMs, int bannerMaxLayers) {
        // Pre-marshal a Java list field if we ever want to expose
        // palette to the plugin (banner picker autocomplete, etc.) —
        // unused today but documents the intent.
        List<String> palette() {
            return List.of();
        }
    }
}
