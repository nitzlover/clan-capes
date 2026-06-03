package dev.crestoria.events;

import dev.crestoria.CrestoriaPlugin;
import dev.crestoria.api.dto.ClanDto;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Tracks who is participating in a running event, their clan, and
 * whether they're still alive in the contest.
 *
 * <p>A player becomes a participant the first time they're seen
 * inside the zone during an active (PvP) stage. Death or leaving the
 * zone past the comeback grace marks them eliminated. The winner is
 * the last clan with at least one non-eliminated participant.
 *
 * <p>Comeback windows (from events.txt):
 *   - crash / kick / accidental zone-exit: {@code reentrySeconds}
 *     (default 30 s) to get back inside before elimination sticks.
 *   - a clan reduced to its last in-zone member: teammates get
 *     {@code teammateGraceSeconds} (default 3 min) to re-enter,
 *     unless a clan bed survives in the zone (bed handling deferred
 *     to the loot/structure pass — for now the timer always applies).
 *
 * <p>Not thread-safe — only touched from the main-thread event tick.
 */
public final class ParticipantTracker {

    /** Per-participant runtime record. */
    public static final class Entry {
        public final UUID uuid;
        public final int clanId;
        public final String clanTag;
        public int kills;
        public int deaths;
        public boolean eliminated;
        /** Wall-clock ms when the player left the zone; 0 if inside. */
        public long leftZoneAt;

        Entry(UUID uuid, int clanId, String clanTag) {
            this.uuid = uuid;
            this.clanId = clanId;
            this.clanTag = clanTag;
        }
    }

    private final CrestoriaPlugin plugin;
    private final Map<UUID, Entry> entries = new HashMap<>();

    public ParticipantTracker(CrestoriaPlugin plugin) {
        this.plugin = plugin;
    }

    /**
     * Register a player as a participant if they're in a clan and not
     * already tracked. No-op for clanless players (events are
     * clan-vs-clan).
     */
    public void enroll(Player player) {
        UUID id = player.getUniqueId();
        if (entries.containsKey(id)) return;
        ClanDto clan = plugin.getClanRepository().getByPlayer(id).orElse(null);
        if (clan == null) return;
        entries.put(id, new Entry(id, clan.id, clan.tag));
    }

    public Entry get(UUID uuid) {
        return entries.get(uuid);
    }

    public boolean isParticipant(UUID uuid) {
        return entries.containsKey(uuid);
    }

    public void recordKill(UUID killer) {
        Entry e = entries.get(killer);
        if (e != null) e.kills++;
    }

    /**
     * Mark a death. Returns the eliminated entry (for chat) or null
     * if the dead player wasn't a participant. Death = immediate
     * elimination in the airdrop ruleset (no respawn-into-zone);
     * teammates' comeback is handled by the clan-alive check, not
     * per-player respawn.
     */
    public Entry recordDeath(UUID victim) {
        Entry e = entries.get(victim);
        if (e == null) return null;
        e.deaths++;
        e.eliminated = true;
        return e;
    }

    /** Player crossed out of the zone — start their re-entry clock. */
    public void markLeftZone(UUID uuid, long nowMs) {
        Entry e = entries.get(uuid);
        if (e != null && e.leftZoneAt == 0 && !e.eliminated) {
            e.leftZoneAt = nowMs;
        }
    }

    /** Player re-entered the zone — clear their re-entry clock. */
    public void markEnteredZone(UUID uuid) {
        Entry e = entries.get(uuid);
        if (e != null) e.leftZoneAt = 0;
    }

    /**
     * Eliminate anyone whose out-of-zone clock exceeded the re-entry
     * window. Call once per tick with the current time + window.
     *
     * @return the newly-eliminated entries (empty if none) so the
     *   caller can broadcast them in event chat — silent eliminations
     *   used to make it look like clans were vanishing for no reason.
     */
    public List<Entry> expireAbsent(long nowMs, long reentryMs) {
        List<Entry> expired = new ArrayList<>();
        for (Entry e : entries.values()) {
            if (e.eliminated || e.leftZoneAt == 0) continue;
            if (nowMs - e.leftZoneAt >= reentryMs) {
                e.eliminated = true;
                expired.add(e);
            }
        }
        return expired;
    }

    /** Distinct clan ids that still have a non-eliminated member. */
    public Set<Integer> aliveClanIds() {
        Set<Integer> out = new HashSet<>();
        for (Entry e : entries.values()) {
            if (!e.eliminated) out.add(e.clanId);
        }
        return out;
    }

    /**
     * @return the sole surviving clan's entry sample, or null if zero
     *   or more than one clan is still alive (i.e. no clean winner
     *   yet).
     */
    public Entry soleSurvivingClanSample() {
        Set<Integer> alive = aliveClanIds();
        if (alive.size() != 1) return null;
        int clanId = alive.iterator().next();
        for (Entry e : entries.values()) {
            if (e.clanId == clanId) return e;
        }
        return null;
    }

    public Map<UUID, Entry> all() {
        return entries;
    }

    public int participantCount() {
        return entries.size();
    }
}
