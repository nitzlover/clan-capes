package dev.clancapes.repo;

import dev.clancapes.api.PanelClient;
import dev.clancapes.api.dto.AnnouncementDto;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import java.util.logging.Logger;

/**
 * In-memory snapshot of every clan's announcement body. Refreshed
 * on a 5-minute scheduled task (default cadence — operator-tunable
 * via {@code panel.refresh-announcements-sec}) and on demand by
 * {@code /clancape reload}.
 *
 * <p>Index: tag (uppercase) → DTO. Lookups by tag are O(1) so the
 * {@code /clan info} command can splice the body in without
 * blocking the main tick thread on an HTTP round-trip.
 *
 * <p>Same shape as the other Wave-1 repos (ClanRepository,
 * ArmorTrimRepository, BannerRepository, SettingsRepository) so
 * future "per-clan polled feature" additions follow one pattern.
 */
public final class AnnouncementRepository {

    private final PanelClient client;
    private final Logger log;
    private final AtomicReference<Map<String, AnnouncementDto>> byTag =
            new AtomicReference<>(Map.of());

    public AnnouncementRepository(PanelClient client, Logger log) {
        this.client = client;
        this.log = log;
    }

    public CompletableFuture<Void> refresh() {
        if (!client.isConfigured()) {
            byTag.set(Map.of());
            return CompletableFuture.completedFuture(null);
        }
        return client.listAnnouncements().thenAccept(this::ingest).exceptionally(e -> {
            log.warning("[announcement-repo] refresh failed: " + e.getMessage());
            return null;
        });
    }

    private void ingest(List<AnnouncementDto> rows) {
        if (rows == null || rows.isEmpty()) {
            byTag.set(Map.of());
            log.info("[announcement-repo] refreshed: 0 announcements");
            return;
        }
        Map<String, AnnouncementDto> next = new HashMap<>(rows.size());
        for (AnnouncementDto a : rows) {
            if (a == null || a.tag == null) continue;
            next.put(a.tag.toUpperCase(Locale.ROOT), a);
        }
        byTag.set(Map.copyOf(next));
        log.info("[announcement-repo] refreshed: " + next.size() + " announcements");
    }

    public Optional<AnnouncementDto> get(String tag) {
        if (tag == null) return Optional.empty();
        return Optional.ofNullable(byTag.get().get(tag.toUpperCase(Locale.ROOT)));
    }
}
