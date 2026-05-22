package dev.clancapes.api;

import com.google.gson.Gson;
import dev.clancapes.config.ClanCapesConfig;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;

public final class CapeApiClient {
    private static final Gson GSON = new Gson();

    private final HttpClient httpClient;
    private final Executor executor;

    public CapeApiClient(Executor executor) {
        this.executor = executor;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(ClanCapesConfig.get().downloadTimeoutMs))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    public CompletableFuture<PlayerCapeResponse> fetchPlayer(UUID uuid) {
        String base = ClanCapesConfig.get().getActiveApiBaseUrl();
        URI uri = URI.create(base + "/api/player/" + uuid);

        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofMillis(ClanCapesConfig.get().downloadTimeoutMs))
                .header("Accept", "application/json")
                .GET()
                .build();

        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenApplyAsync(response -> {
                    if (response.statusCode() != 200) {
                        return PlayerCapeResponse.empty();
                    }
                    try {
                        PlayerCapeResponse parsed = GSON.fromJson(response.body(), PlayerCapeResponse.class);
                        return parsed != null ? parsed : PlayerCapeResponse.empty();
                    } catch (Exception e) {
                        return PlayerCapeResponse.empty();
                    }
                }, executor)
                .exceptionally(ex -> PlayerCapeResponse.empty());
    }
}
