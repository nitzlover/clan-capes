package dev.clancapes.api;

import com.google.gson.annotations.SerializedName;

import java.util.Collections;
import java.util.Map;

/**
 * Response from {@code GET /api/player/{uuid}/trims}. The {@code trims}
 * map keys are armor slot names — {@code head}, {@code chest},
 * {@code legs}, {@code feet}. Each value carries the Minecraft
 * material + pattern identifier ({@code "diamond"} / {@code "sentry"}
 * etc.) which the mixin layer maps to vanilla TrimMaterial / TrimPattern
 * registry keys at render time.
 */
public record PlayerTrimResponse(
        @SerializedName("hasTrims") boolean hasTrims,
        @SerializedName("clan") String clan,
        @SerializedName("trims") Map<String, SlotTrim> trims,
        @SerializedName("updatedAt") long updatedAt
) {
    public static PlayerTrimResponse empty() {
        return new PlayerTrimResponse(false, null, Collections.emptyMap(), 0L);
    }

    public record SlotTrim(
            @SerializedName("material") String material,
            @SerializedName("pattern") String pattern
    ) {}
}
