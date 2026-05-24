package dev.clancapes.clan;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory invitation tracker.
 * <p>
 * Phase 2 ships clan invites as plugin-local state — leader's
 * {@code /clan invite player} call stashes a pending row here that
 * the invitee then consumes via {@code /clan accept TAG} or
 * {@code /clan decline TAG}. We track the inviter UUID alongside
 * the expiry so accept / decline can notify the original inviter
 * without an extra panel round-trip.
 * <p>
 * Invitations live ~5 minutes. Surviving a server restart isn't
 * required for the UX; if the server crashes mid-invite, the leader
 * just re-runs the command.
 */
public final class PendingInvites {
    private static final long EXPIRES_MS = 5 * 60 * 1000;

    /** One pending invitation: who invited the player, plus when it expires. */
    public record Entry(UUID inviter, long expiresAt) {}

    /** invitee UUID → tag → Entry. */
    private final Map<UUID, Map<String, Entry>> invites = new ConcurrentHashMap<>();

    /** Record a new pending invitation. Overwrites any existing entry for (invitee, tag). */
    public void put(UUID invitee, String tag, UUID inviter) {
        invites
                .computeIfAbsent(invitee, k -> new ConcurrentHashMap<>())
                .put(tag.toUpperCase(),
                        new Entry(inviter, System.currentTimeMillis() + EXPIRES_MS));
    }

    /** Live entry for (invitee, tag), or null if missing/expired. Evicts stale entries lazily. */
    public Entry get(UUID invitee, String tag) {
        Map<String, Entry> mine = invites.get(invitee);
        if (mine == null) return null;
        Entry e = mine.get(tag.toUpperCase());
        if (e == null) return null;
        if (e.expiresAt() < System.currentTimeMillis()) {
            mine.remove(tag.toUpperCase());
            return null;
        }
        return e;
    }

    public boolean has(UUID invitee, String tag) {
        return get(invitee, tag) != null;
    }

    /** Remove an invitation (after accept / decline / expiry). */
    public void remove(UUID invitee, String tag) {
        Map<String, Entry> mine = invites.get(invitee);
        if (mine != null) {
            mine.remove(tag.toUpperCase());
            if (mine.isEmpty()) invites.remove(invitee);
        }
    }

    /** All currently-unexpired clan tags this player can accept right now. */
    public Set<String> pendingFor(UUID invitee) {
        Map<String, Entry> mine = invites.get(invitee);
        if (mine == null) return Set.of();
        long now = System.currentTimeMillis();
        Map<String, Entry> alive = new HashMap<>();
        for (var e : mine.entrySet()) {
            if (e.getValue().expiresAt() >= now) alive.put(e.getKey(), e.getValue());
        }
        if (alive.size() != mine.size()) {
            mine.keySet().retainAll(alive.keySet());
        }
        return Set.copyOf(alive.keySet());
    }
}
