package dev.clancapes.api;

import com.google.gson.Gson;
import dev.clancapes.ClanCapesClient;
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
        String base = ClanCapesConfig.get().apiBaseUrl.replaceAll("/$", "");
        URI uri = URI.create(base + "/api/player/" + uuid);

        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofMillis(ClanCapesConfig.get().downloadTimeoutMs))
                .header("Accept", "application/json")
                .GET()
                .build();

        return httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenApplyAsync(response -> {
                    if (response.statusCode() != 200) {
                        if (response.statusCode() != 404) {
                            ClanCapesClient.LOGGER.warn("API /player/{} HTTP {}", uuid, response.statusCode());
                        }
                        return PlayerCapeResponse.empty();
                    }
                    try {
                        PlayerCapeResponse parsed = GSON.fromJson(response.body(), PlayerCapeResponse.class);
                        if (ClanCapesConfig.get().debugLogging) {
                            ClanCapesClient.LOGGER.info("API /player/{} -> hasCape={} clan={}",
                                    uuid, parsed != null && parsed.hasCape(),
                                    parsed != null ? parsed.clan() : null);
                        }
                        return parsed != null ? parsed : PlayerCapeResponse.empty();
                    } catch (Exception e) {
                        ClanCapesClient.LOGGER.warn("API /player/{} parse failed: {}", uuid, e.getMessage());
                        return PlayerCapeResponse.empty();
                    }
                }, executor)
                .exceptionally(ex -> {
                    ClanCapesClient.LOGGER.warn("API /player/{} failed: {}", uuid, ex.getMessage());
                    return PlayerCapeResponse.empty();
                });
    }
}
