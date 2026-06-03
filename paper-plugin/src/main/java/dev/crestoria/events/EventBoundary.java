package dev.crestoria.events;

import org.bukkit.Location;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Process-wide registration of the currently-active event zone and
 * whether its boundary is sealed.
 *
 * <p>An event registers its {@link Zone} here on start and flips
 * {@code sealed} on at the stage where the contest locks (finale +
 * loot collection for the airdrop). While sealed, {@link
 * BoundaryListener} stops outsiders from crossing in, pearling in, or
 * bridging blocks into the zone — the {@code allowed} set (the
 * enrolled participants) is exempt so the contestants keep moving and
 * building freely.
 *
 * <p>One event runs at a time (enforced by {@link EventScheduler}),
 * so a single static slot is sufficient. {@link AtomicReference}
 * keeps the read path on the listener's main-thread hot loop cheap
 * and visible across the async event ticks that mutate it.
 */
public final class EventBoundary {

    /** Immutable snapshot swapped atomically on each state change. */
    private record State(Zone zone, boolean sealed, Set<UUID> allowed) {}

    private static final AtomicReference<State> STATE = new AtomicReference<>(null);

    private EventBoundary() {}

    /** Register the active zone (open / not sealed yet). */
    public static void open(Zone zone) {
        STATE.set(new State(zone, false, Set.of()));
    }

    /**
     * Seal the boundary. {@code allowed} are the UUIDs exempt from the
     * crossing / pearl / block rules (the enrolled participants).
     *
     * <p>Uses compareAndSet so a concurrent {@link #clear()} or
     * {@link #open(Zone)} from a different event can't be silently
     * overwritten. If we lose the CAS we retry once against the new
     * state; a second null read means the event we were sealing has
     * already been cleared, in which case we no-op.
     */
    public static void seal(Set<UUID> allowed) {
        Set<UUID> snapshot = Set.copyOf(allowed);
        for (int attempt = 0; attempt < 2; attempt++) {
            State cur = STATE.get();
            if (cur == null) return;
            State next = new State(cur.zone(), true, snapshot);
            if (STATE.compareAndSet(cur, next)) return;
        }
    }

    /** Drop the registration entirely (event ended). */
    public static void clear() {
        STATE.set(null);
    }

    public static boolean isSealed() {
        State s = STATE.get();
        return s != null && s.sealed;
    }

    /** @return the active zone, or null if no event is registered. */
    public static Zone zone() {
        State s = STATE.get();
        return s == null ? null : s.zone();
    }

    public static boolean isAllowed(UUID uuid) {
        State s = STATE.get();
        return s != null && s.allowed().contains(uuid);
    }

    /** Convenience: is this location inside the active zone? */
    public static boolean contains(Location loc) {
        State s = STATE.get();
        return s != null && s.zone().contains(loc);
    }
}
