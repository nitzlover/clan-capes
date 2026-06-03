package dev.crestoria.repo;

import dev.crestoria.api.PanelClient;
import dev.crestoria.api.dto.EventConfigDto;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import java.util.logging.Logger;

/**
 * In-memory snapshot of per-event-type config. Refreshed on the
 * scheduled task and on demand by {@code /clancape reload}.
 *
 * <p>Index: type (lowercase) → DTO. The {@link
 * dev.crestoria.events.EventScheduler} hits this every tick to
 * decide whether to fire a new event, so O(1) reads matter.
 *
 * <p>Same shape as the other repos so future polling adds follow
 * the established pattern.
 */
public final class EventConfigRepository {

    private final PanelClient client;
    private final Logger log;
    private final AtomicReference<Map<String, EventConfigDto>> byType =
            new AtomicReference<>(Map.of());

    public EventConfigRepository(PanelClient client, Logger log) {
        this.client = client;
        this.log = log;
    }

    public CompletableFuture<Void> refresh() {
        if (!client.isConfigured()) {
            byType.set(Map.of());
            return CompletableFuture.completedFuture(null);
        }
        return client.listEventConfigs().thenAccept(this::ingest).exceptionally(e -> {
            log.warning("[event-config-repo] refresh failed: " + e.getMessage());
            return null;
        });
    }

    private void ingest(List<EventConfigDto> rows) {
        if (rows == null || rows.isEmpty()) {
            byType.set(Map.of());
            log.info("[event-config-repo] refreshed: 0 configs");
            return;
        }
        Map<String, EventConfigDto> next = new HashMap<>(rows.size());
        for (EventConfigDto c : rows) {
            if (c == null || c.type == null) continue;
            next.put(c.type.toLowerCase(Locale.ROOT), c);
        }
        byType.set(Map.copyOf(next));
        log.info("[event-config-repo] refreshed: " + next.size() + " configs");
    }

    public Optional<EventConfigDto> get(String type) {
        if (type == null) return Optional.empty();
        return Optional.ofNullable(byType.get().get(type.toLowerCase(Locale.ROOT)));
    }

    public List<EventConfigDto> all() {
        return List.copyOf(byType.get().values());
    }
}
