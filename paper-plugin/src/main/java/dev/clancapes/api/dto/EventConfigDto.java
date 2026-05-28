package dev.clancapes.api.dto;

import com.google.gson.JsonObject;

/**
 * Per-(server, type) event scheduler config pulled from the panel's
 * {@code /api/plugin/events/config} endpoint. Mirrors the shape
 * defined in {@code src/lib/server/event-config.ts} on the panel
 * side — keep the two synced when fields are added.
 *
 * <p>{@code payload} carries variant-specific knobs (prep / landing /
 * finale durations for airdrop, structure id for koth, etc.). Left
 * as a Gson JsonObject so each event type can pluck what it needs
 * without forcing every variant's params onto this DTO.
 */
public final class EventConfigDto {
    public String type;          // "airdrop" | "koth"
    public boolean enabled;
    public int intervalMinutes;
    public int durationMinutes;
    public int radiusBlocks;
    public JsonObject payload;
}
