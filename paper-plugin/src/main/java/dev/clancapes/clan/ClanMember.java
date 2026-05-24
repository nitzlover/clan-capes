package dev.clancapes.clan;

import com.google.gson.annotations.SerializedName;

import java.util.UUID;

/**
 * Plugin-side clan member record — JSON-deserialised from the panel's
 * ClanMemberDto. {@code role} maps onto the panel's {@code member_role}
 * enum: {@code leader}, {@code deputy}, or {@code member}.
 */
public final class ClanMember {
    @SerializedName("playerUuid")
    private final UUID playerUuid;
    @SerializedName("playerName")
    private final String playerName;
    private final Role role;
    @SerializedName("joinedAt")
    private final String joinedAt;

    public ClanMember(UUID playerUuid, String playerName, Role role, String joinedAt) {
        this.playerUuid = playerUuid;
        this.playerName = playerName;
        this.role = role;
        this.joinedAt = joinedAt;
    }

    public UUID playerUuid() { return playerUuid; }
    public String playerName() { return playerName; }
    public Role role() { return role; }
    public String joinedAt() { return joinedAt; }

    public boolean isLeader() { return role == Role.LEADER; }
    public boolean isDeputy() { return role == Role.DEPUTY; }
    public boolean canManage() { return role == Role.LEADER || role == Role.DEPUTY; }

    /**
     * Roles are serialised lowercase on the wire so they match the
     * panel's pgEnum literal directly. Gson uses the enum constant
     * name by default, hence the explicit {@code @SerializedName}.
     */
    public enum Role {
        @SerializedName("leader") LEADER,
        @SerializedName("deputy") DEPUTY,
        @SerializedName("member") MEMBER,
    }
}
