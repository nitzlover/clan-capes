package dev.clancapes.model;

public record ClanCapeRecord(
        String clanTag,
        String capeUrl,
        String fileName,
        long updatedAt,
        String updatedBy
) {
}
