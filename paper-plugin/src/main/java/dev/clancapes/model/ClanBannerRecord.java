package dev.clancapes.model;

import java.util.List;

/**
 * Persistent shield-banner spec for one clan.
 *
 * Storage layout matches the cape record shape: PK by clanTag, with
 * who/when audit fields. The pattern list is stored as raw {@code BannerPatternSpec}
 * records and serialised to JSON when persisted to SQLite (TEXT column)
 * or the JSON storage file.
 */
public record ClanBannerRecord(
        String clanTag,
        int baseColor,
        List<BannerPatternSpec> patterns,
        long updatedAt,
        String updatedBy
) {
}
