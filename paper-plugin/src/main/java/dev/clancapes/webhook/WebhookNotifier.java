package dev.clancapes.webhook;

import com.google.gson.Gson;
import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.config.PluginConfig;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

public final class WebhookNotifier {
    private static final Gson GSON = new Gson();

    private final ClanCapesPlugin plugin;
    private final PluginConfig config;
    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public WebhookNotifier(ClanCapesPlugin plugin, PluginConfig config) {
        this.plugin = plugin;
        this.config = config;
    }

    public void notifyCapeUpdated(String clanTag, String capeUrl) {
        send("cape.updated", Map.of("clan", clanTag, "capeUrl", capeUrl));
    }

    public void notifyCapeRemoved(String clanTag) {
        send("cape.removed", Map.of("clan", clanTag));
    }

    private void send(String event, Map<String, Object> payload) {
        if (!config.isWebhookEnabled() || config.getWebhookUrl().isBlank()) {
            return;
        }
        Map<String, Object> body = Map.of(
                "event", event,
                "secret", config.getWebhookSecret(),
                "payload", payload,
                "timestamp", System.currentTimeMillis()
        );
        HttpRequest request = HttpRequest.newBuilder(URI.create(config.getWebhookUrl()))
                .timeout(Duration.ofSeconds(5))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(GSON.toJson(body)))
                .build();
        client.sendAsync(request, HttpResponse.BodyHandlers.discarding())
                .exceptionally(ex -> {
                    plugin.getLogger().warning("Webhook failed: " + ex.getMessage());
                    return null;
                });
    }
}
