package dev.clancapes.model;

import com.google.gson.annotations.SerializedName;

public record PlayerCapeDto(
        @SerializedName("hasCape") boolean hasCape,
        @SerializedName("capeUrl") String capeUrl,
        @SerializedName("clan") String clan,
        @SerializedName("updatedAt") long updatedAt
) {
    public static PlayerCapeDto none() {
        return new PlayerCapeDto(false, null, null, 0L);
    }
}
