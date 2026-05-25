package dev.clancapes.cape;

import dev.clancapes.api.PlayerCapeResponse;
import net.minecraft.resources.Identifier;

import java.util.UUID;

public final class PlayerCapeState {
    private final UUID playerId;
    private volatile boolean hasCape;
    private volatile String capeUrl;
    private volatile String clan;
    private volatile long updatedAt;
    private volatile Identifier textureId;
    private volatile long lastFetchedAtMs;
    private volatile long lastAppliedUpdatedAt;

    public PlayerCapeState(UUID playerId) {
        this.playerId = playerId;
    }

    public UUID playerId() {
        return playerId;
    }

    public boolean hasCape() {
        return hasCape;
    }

    public String capeUrl() {
        return capeUrl;
    }

    public String clan() {
        return clan;
    }

    public long updatedAt() {
        return updatedAt;
    }

    public Identifier textureId() {
        return textureId;
    }

    public void setTextureId(Identifier textureId) {
        this.textureId = textureId;
    }

    public long lastFetchedAtMs() {
        return lastFetchedAtMs;
    }

    public void applyApi(PlayerCapeResponse response) {
        this.hasCape = response.hasCape();
        this.capeUrl = response.capeUrl();
        this.clan = response.clan();
        this.updatedAt = response.updatedAt();
        this.lastFetchedAtMs = System.currentTimeMillis();
    }

    public boolean needsTextureReload() {
        return hasCape && capeUrl != null && !capeUrl.isBlank()
                && updatedAt != lastAppliedUpdatedAt;
    }

    public void markTextureApplied() {
        this.lastAppliedUpdatedAt = updatedAt;
    }

    public void clear() {
        hasCape = false;
        capeUrl = null;
        clan = null;
        updatedAt = 0L;
        textureId = null;
        lastAppliedUpdatedAt = 0L;
    }
}
