package dev.clancapes.api;

import com.google.gson.annotations.SerializedName;

public record PlayerCapeResponse(
        @SerializedName("hasCape") boolean hasCape,
        @SerializedName("capeUrl") String capeUrl,
        @SerializedName("clan") String clan,
        @SerializedName("updatedAt") long updatedAt
) {
    public static PlayerCapeResponse empty() {
        return new PlayerCapeResponse(false, null, null, 0L);
    }
}
