package dev.crestoria.api.dto;

/**
 * Per-clan announcement body shipped by the panel.
 *
 * <p>Matches the {@code GET /api/plugin/announcements} payload (one
 * row per clan with a body). Fields are mutable + public to keep the
 * Gson reflective deserialiser cheap — same convention as the other
 * DTOs in this package.
 */
public final class AnnouncementDto {
    public String tag;
    public String body;
    public String updatedAt;
    public String updatedBy;
}
