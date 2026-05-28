package dev.clancapes.api.dto;

import java.util.List;

public final class ClanDto {
    public int id;
    public String tag;
    public String name;
    public String colorHex;
    public String leaderUuid;
    public String createdAt;
    /**
     * Wave 2 — per-clan PvP toggle. Default {@code true} = vanilla
     * behaviour (intra-clan damage allowed). When {@code false}, the
     * {@link dev.clancapes.listener.FriendlyFireListener} cancels
     * {@code EntityDamageByEntityEvent} between two members of this clan.
     *
     * <p>Boxed {@link Boolean} so a pre-migration JSON payload (no field
     * present) deserialises to {@code null} and the listener can fall
     * through to the safe default of "allow damage".
     */
    public Boolean friendlyFire;
    public List<MemberDto> members;
    public StatsDto stats;

    public static final class MemberDto {
        public String playerUuid;
        public String playerName;
        public String role;
        public String joinedAt;
    }

    public static final class StatsDto {
        public int kills;
        public int deaths;
        public double kd;
    }
}
