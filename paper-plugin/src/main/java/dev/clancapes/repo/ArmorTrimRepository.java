package dev.clancapes.repo;

import dev.clancapes.api.PanelClient;
import dev.clancapes.api.dto.TrimDto;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import java.util.logging.Logger;

/**
 * Cached armor trim spec per (clan tag, slot). Slots are head/chest/legs/feet.
 * Refreshed by the scheduler; consumed by listeners + PAPI.
 */
public final class ArmorTrimRepository {

    private final PanelClient client;
    private final Logger log;
    private final AtomicReference<Map<String, Map<String, TrimDto>>> snapshot =
            new AtomicReference<>(Map.of());

    public ArmorTrimRepository(PanelClient client, Logger log) {
        this.client = client;
        this.log = log;
    }

    public CompletableFuture<Void> refresh() {
        if (!client.isConfigured()) {
            snapshot.set(Map.of());
            return CompletableFuture.completedFuture(null);
        }
        return client.listArmorTrims().thenAccept(trims -> {
            Map<String, Map<String, TrimDto>> next = build(trims);
            snapshot.set(next);
            log.info("[trim-repo] refreshed: " + next.size() + " clans");
        }).exceptionally(e -> {
            log.warning("[trim-repo] refresh failed: " + e.getMessage());
            return null;
        });
    }

    public Optional<TrimDto> get(String tag, String slot) {
        Map<String, TrimDto> slots = snapshot.get().get(tag.toUpperCase(Locale.ROOT));
        if (slots == null) return Optional.empty();
        return Optional.ofNullable(slots.get(slot.toLowerCase(Locale.ROOT)));
    }

    public Map<String, TrimDto> getAllForClan(String tag) {
        Map<String, TrimDto> slots = snapshot.get().get(tag.toUpperCase(Locale.ROOT));
        return slots == null ? Map.of() : slots;
    }

    private static Map<String, Map<String, TrimDto>> build(List<TrimDto> trims) {
        if (trims == null || trims.isEmpty()) return Map.of();
        Map<String, Map<String, TrimDto>> out = new HashMap<>();
        for (TrimDto t : trims) {
            if (t.clan == null || t.slot == null) continue;
            out.computeIfAbsent(t.clan.toUpperCase(Locale.ROOT), k -> new HashMap<>())
                    .put(t.slot.toLowerCase(Locale.ROOT), t);
        }
        // Make inner maps immutable for safer concurrent reads.
        Map<String, Map<String, TrimDto>> immutable = new HashMap<>(out.size());
        for (Map.Entry<String, Map<String, TrimDto>> e : out.entrySet()) {
            immutable.put(e.getKey(), Map.copyOf(e.getValue()));
        }
        return Map.copyOf(immutable);
    }
}
