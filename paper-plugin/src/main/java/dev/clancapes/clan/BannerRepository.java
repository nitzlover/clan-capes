package dev.clancapes.clan;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.model.ClanBannerRecord;
import dev.clancapes.panel.PanelClient;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import java.util.logging.Level;

/**
 * In-memory banner-spec cache backed by the panel REST API.
 * <p>
 * Mirrors the {@link ClanRepository} design — wholesale-refreshed
 * {@link AtomicReference} of {@code tag → ClanBannerRecord} so reads
 * are lock-free and writes flip a single pointer. The repository
 * exists to replace the legacy local-SQLite banner store; once the
 * panel is the source of truth, every read happens against this
 * cache and {@link dev.clancapes.service.BannerService} no longer
 * needs to talk to local storage.
 * <p>
 * Cache freshness: refreshed on plugin enable, again every five
 * minutes from {@link dev.clancapes.ClanCapesPlugin}'s scheduler,
 * and on-demand whenever the panel pings the plugin's internal
 * banner-mirror endpoint after an admin save. Transient panel
 * outages keep the previous snapshot in place rather than blanking
 * the cache — a stale banner is far less surprising than a sudden
 * loss of clan livery mid-fight.
 */
public final class BannerRepository {
    private final ClanCapesPlugin plugin;
    private final PanelClient panelClient;

    /** Upper-case tag → record. Replaced wholesale on every refresh. */
    private final AtomicReference<Map<String, ClanBannerRecord>> byTag =
            new AtomicReference<>(Map.of());

    public BannerRepository(ClanCapesPlugin plugin) {
        this.plugin = plugin;
        this.panelClient = plugin.getPanelClient();
    }

    /** Empty Optional before the first successful refresh, or for clans with no spec. */
    public Optional<ClanBannerRecord> byTag(String tag) {
        if (tag == null) return Optional.empty();
        return Optional.ofNullable(byTag.get().get(tag.toUpperCase()));
    }

    public int size() {
        return byTag.get().size();
    }

    /**
     * Async wholesale refresh from {@code GET /api/plugin/banners}.
     * Replaces the cache atomically; failures leave the existing
     * cache in place and log a WARNING so connected players keep
     * their painted shields while transient panel outages clear.
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
                List<ClanBannerRecord> fresh = panelClient.fetchBanners(panelUrl, apiKey);
                Map<String, ClanBannerRecord> map = new HashMap<>(fresh.size() * 2);
                for (ClanBannerRecord r : fresh) {
                    map.put(r.clanTag().toUpperCase(), r);
                }
                byTag.set(Collections.unmodifiableMap(map));
                if (plugin.getPluginConfig().isDebugLogging()) {
                    plugin.getLogger().info("[BannerRepository] refreshed: " + map.size() + " banner(s)");
                }
            } catch (PanelClient.PanelException e) {
                plugin.getLogger().log(Level.WARNING,
                        "[BannerRepository] refresh failed (keeping previous cache): " + e.getMessage());
            } finally {
                if (onDone != null) onDone.run();
            }
        });
    }

    /**
     * Single-tag refresh — used when the panel pings us after an
     * admin save. Falls back to a full refresh on a non-404 error so
     * we never get stuck with a stale entry for a tag the panel knows
     * about.
     */
    public void refreshTagAsync(String tag) {
        if (tag == null) return;
        String upper = tag.toUpperCase();
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            String panelUrl = plugin.getPluginConfig().getPanelUrl();
            String apiKey = plugin.getPluginConfig().getPanelApiKey();
            if (panelUrl == null || panelUrl.isBlank() || apiKey == null || apiKey.isBlank()) {
                return;
            }
            try {
                ClanBannerRecord fresh = panelClient.fetchBannerByTag(panelUrl, apiKey, upper);
                Map<String, ClanBannerRecord> next = new HashMap<>(byTag.get());
                if (fresh == null) {
                    next.remove(upper);
                } else {
                    next.put(upper, fresh);
                }
                byTag.set(Collections.unmodifiableMap(next));
            } catch (PanelClient.PanelException e) {
                plugin.getLogger().log(Level.WARNING,
                        "[BannerRepository] tag refresh failed, falling back to bulk: " + e.getMessage());
                refreshAsync(null);
            }
        });
    }
}
