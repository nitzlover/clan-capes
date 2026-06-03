package dev.crestoria.repo;

import dev.crestoria.api.PanelClient;
import dev.crestoria.api.dto.BannerDto;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import java.util.logging.Logger;

/**
 * Cached clan banner specs. Each entry holds the base color + raw
 * pattern JSON; the plugin paints the actual banner item from this
 * spec when the leader requests it in-game.
 */
public final class BannerRepository {

    private final PanelClient client;
    private final Logger log;
    private final AtomicReference<Map<String, BannerDto>> snapshot =
            new AtomicReference<>(Map.of());

    public BannerRepository(PanelClient client, Logger log) {
        this.client = client;
        this.log = log;
    }

    public CompletableFuture<Void> refresh() {
        if (!client.isConfigured()) {
            snapshot.set(Map.of());
            return CompletableFuture.completedFuture(null);
        }
        return client.listBanners().thenAccept(banners -> {
            snapshot.set(build(banners));
            log.info("[banner-repo] refreshed: " + snapshot.get().size() + " banners");
        }).exceptionally(e -> {
            log.warning("[banner-repo] refresh failed: " + e.getMessage());
            return null;
        });
    }

    public Optional<BannerDto> get(String tag) {
        return Optional.ofNullable(snapshot.get().get(tag.toUpperCase(Locale.ROOT)));
    }

    private static Map<String, BannerDto> build(List<BannerDto> list) {
        if (list == null || list.isEmpty()) return Map.of();
        Map<String, BannerDto> out = new HashMap<>(list.size());
        for (BannerDto b : list) {
            if (b.clan == null) continue;
            out.put(b.clan.toUpperCase(Locale.ROOT), b);
        }
        return Map.copyOf(out);
    }
}
