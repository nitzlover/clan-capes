package dev.crestoria.repo;

import dev.crestoria.api.PanelClient;
import dev.crestoria.api.dto.ClanDto;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import java.util.logging.Logger;

/**
 * In-memory snapshot of every active clan on this server. Refreshed
 * via {@link #refresh()} which is called on a scheduled task and on
 * demand by /clancape reload. Two indices: tag → clan, and player
 * UUID → tag for the reverse lookup used by chat / death / PAPI.
 */
public final class ClanRepository {

    private final PanelClient client;
    private final Logger log;
    private final AtomicReference<Snapshot> snapshot =
            new AtomicReference<>(Snapshot.empty());

    public ClanRepository(PanelClient client, Logger log) {
        this.client = client;
        this.log = log;
    }

    public CompletableFuture<Void> refresh() {
        if (!client.isConfigured()) {
            snapshot.set(Snapshot.empty());
            return CompletableFuture.completedFuture(null);
        }
        return client.listClans().thenAccept(clans -> {
            Snapshot s = Snapshot.from(clans);
            snapshot.set(s);
            log.info("[clan-repo] refreshed: " + s.byTag.size() + " clans");
        }).exceptionally(e -> {
            log.warning("[clan-repo] refresh failed: " + e.getMessage());
            return null;
        });
    }

    public Optional<ClanDto> getByTag(String tag) {
        return Optional.ofNullable(snapshot.get().byTag.get(tag.toUpperCase(Locale.ROOT)));
    }

    public Optional<ClanDto> getByPlayer(UUID playerUuid) {
        String tag = snapshot.get().tagByPlayer.get(playerUuid);
        return tag == null ? Optional.empty() : getByTag(tag);
    }

    public Optional<String> getRole(UUID playerUuid) {
        ClanDto clan = getByPlayer(playerUuid).orElse(null);
        if (clan == null || clan.members == null) return Optional.empty();
        return clan.members.stream()
                .filter(m -> playerUuid.toString().equalsIgnoreCase(m.playerUuid))
                .map(m -> m.role)
                .findFirst();
    }

    public List<ClanDto> all() {
        return List.copyOf(snapshot.get().byTag.values());
    }

    private record Snapshot(Map<String, ClanDto> byTag, Map<UUID, String> tagByPlayer) {
        static Snapshot empty() {
            return new Snapshot(Map.of(), Map.of());
        }

        static Snapshot from(List<ClanDto> clans) {
            if (clans == null || clans.isEmpty()) return empty();
            Map<String, ClanDto> byTag = new HashMap<>(clans.size());
            Map<UUID, String> tagByPlayer = new HashMap<>();
            for (ClanDto c : clans) {
                if (c.tag == null) continue;
                String tag = c.tag.toUpperCase(Locale.ROOT);
                byTag.put(tag, c);
                if (c.members != null) {
                    for (ClanDto.MemberDto m : c.members) {
                        if (m.playerUuid == null) continue;
                        try {
                            tagByPlayer.put(UUID.fromString(m.playerUuid), tag);
                        } catch (IllegalArgumentException ignore) {
                        }
                    }
                }
            }
            return new Snapshot(Map.copyOf(byTag), Map.copyOf(tagByPlayer));
        }
    }
}
