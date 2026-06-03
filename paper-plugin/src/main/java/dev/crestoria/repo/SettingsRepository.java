package dev.crestoria.repo;

import com.google.gson.JsonObject;
import dev.crestoria.api.PanelClient;
import dev.crestoria.api.dto.SettingsDto;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicReference;
import java.util.logging.Logger;

/**
 * Operator settings (palette, max trims, cooldowns) pulled from the
 * panel. Held as a raw JsonObject so adding fields to the panel side
 * doesn't require redeploying the plugin.
 */
public final class SettingsRepository {

    private final PanelClient client;
    private final Logger log;
    private final AtomicReference<JsonObject> snapshot =
            new AtomicReference<>(new JsonObject());

    public SettingsRepository(PanelClient client, Logger log) {
        this.client = client;
        this.log = log;
    }

    public CompletableFuture<Void> refresh() {
        if (!client.isConfigured()) {
            snapshot.set(new JsonObject());
            return CompletableFuture.completedFuture(null);
        }
        return client.getSettings().thenAccept((SettingsDto s) -> {
            if (s != null && s.settings != null) snapshot.set(s.settings);
            log.info("[settings-repo] refreshed");
        }).exceptionally(e -> {
            log.warning("[settings-repo] refresh failed: " + e.getMessage());
            return null;
        });
    }

    public JsonObject get() {
        return snapshot.get();
    }
}
