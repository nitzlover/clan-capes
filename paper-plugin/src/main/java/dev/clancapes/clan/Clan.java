package dev.clancapes.clan;

import com.google.gson.annotations.SerializedName;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Plugin-side clan record — mirrors the panel's ClanDto shape so
 * Gson can deserialise the {@code /api/plugin/clans/*} JSON directly.
 * <p>
 * Immutable on the plugin side: every mutation goes through the
 * panel (Phase 2.3+) and the plugin's cache is refreshed wholesale
 * from the returned response. No setters here.
 */
public final class Clan {
    private final int id;
    private final String tag;
    private final String name;
    @SerializedName("colorHex")
    private final String colorHex;
    @SerializedName("leaderUuid")
    private final UUID leaderUuid;
    @SerializedName("createdAt")
    private final String createdAt;
    private final List<ClanMember> members;

    public Clan(int id, String tag, String name, String colorHex, UUID leaderUuid,
                String createdAt, List<ClanMember> members) {
        this.id = id;
        this.tag = tag;
        this.name = name;
        this.colorHex = colorHex;
        this.leaderUuid = leaderUuid;
        this.createdAt = createdAt;
        this.members = members == null ? List.of() : List.copyOf(members);
    }

    public int id() { return id; }
    public String tag() { return tag; }
    public String name() { return name; }
    public String colorHex() { return colorHex; }
    public UUID leaderUuid() { return leaderUuid; }
    public String createdAt() { return createdAt; }
    public List<ClanMember> members() { return members; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Clan c)) return false;
        return id == c.id;
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }

    @Override
    public String toString() {
        return "Clan[" + tag + " (" + members.size() + " members)]";
    }
}
