package dev.clancapes.api.dto;

import java.util.List;

public final class ClanDto {
    public int id;
    public String tag;
    public String name;
    public String colorHex;
    public String leaderUuid;
    public String createdAt;
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
