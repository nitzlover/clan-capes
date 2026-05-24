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
 * {@code /clan decline TAG}. We don't persist these to the panel
 * because (a) invitations expire fast (5 min by default) and (b)
 * surviving a server restart isn't required for the user experience
 * — if the server crashes mid-invite, the leader just re-runs the
 * command.
 * <p>
 * If/when we need cross-server clan invites we'll move this onto
 * the panel's {@code clan_invitations} table (which is already in
 * the schema, see Phase 0). Migration will be transparent.
 */
public final class PendingInvites {
    private static final long EXPIRES_MS = 5 * 60 * 1000;

    /** invitee UUID → tag → expiresAt (epoch ms). */
    private final Map<UUID, Map<String, Long>> invites = new ConcurrentHashMap<>();

    /** Record a new pending invitation. Overwrites any existing entry for the same (invitee, tag). */
    public void put(UUID invitee, String tag) {
        invites
                .computeIfAbsent(invitee, k -> new ConcurrentHashMap<>())
                .put(tag.toUpperCase(), System.currentTimeMillis() + EXPIRES_MS);
    }

    /** True iff an unexpired invitation exists for (invitee, tag). Also evicts stale entries lazily. */
    public boolean has(UUID invitee, String tag) {
        Map<String, Long> mine = invites.get(invitee);
        if (mine == null) return false;
        Long expires = mine.get(tag.toUpperCase());
        if (expires == null) return false;
        if (expires < System.currentTimeMillis()) {
            mine.remove(tag.toUpperCase());
            return false;
        }
        return true;
    }

    /** Remove an invitation (after accept / decline / expiry). */
    public void remove(UUID invitee, String tag) {
        Map<String, Long> mine = invites.get(invitee);
        if (mine != null) {
            mine.remove(tag.toUpperCase());
            if (mine.isEmpty()) invites.remove(invitee);
        }
    }

    /** All currently-unexpired clan tags this player can accept right now. */
    public Set<String> pendingFor(UUID invitee) {
        Map<String, Long> mine = invites.get(invitee);
        if (mine == null) return Set.of();
        long now = System.currentTimeMillis();
        Map<String, Long> alive = new HashMap<>();
        for (var e : mine.entrySet()) {
            if (e.getValue() >= now) alive.put(e.getKey(), e.getValue());
        }
        // Lazy eviction so the map doesn't grow forever.
        if (alive.size() != mine.size()) {
            mine.keySet().retainAll(alive.keySet());
        }
        return Set.copyOf(alive.keySet());
    }
}
