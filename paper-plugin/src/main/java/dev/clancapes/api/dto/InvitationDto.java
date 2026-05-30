package dev.clancapes.api.dto;

/**
 * Pending or recently-resolved clan invitation as returned by
 *   POST /api/plugin/clans/{tag}/invites and
 *   GET  /api/plugin/players/{uuid}/invites.
 *
 * Field shape matches the panel response. Times are ISO-8601
 * strings so the plugin can hand them straight to chat formatters
 * without bringing in a wider date library; numeric ages are
 * derived from the wall clock on demand.
 */
public final class InvitationDto {
    public int id;
    public int clanId;
    public String clanTag;
    public String clanName;
    public String clanColorHex;
    public String inviteeUuid;
    public String inviteeName;
    public String inviterUuid;
    public String status;
    public String expiresAt;
    public String createdAt;
}
