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

/**
 * Mirrors {@link CapeApiClient} for armour trim data. Calls
 * {@code GET /api/player/{uuid}/trims} on the configured panel base URL
 * and returns the parsed response (or {@link PlayerTrimResponse#empty()}
 * on any failure).
 */
public final class TrimApiClient {
    private static final Gson GSON = new Gson();

    private final HttpClient httpClient;
    private final Executor executor;

    public TrimApiClient(Executor executor) {
        this.executor = executor;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(ClanCapesConfig.get().downloadTimeoutMs))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    public CompletableFuture<PlayerTrimResponse> fetchPlayer(UUID uuid) {
        String base = ClanCapesConfig.get().apiBaseUrl.replaceAll("/$", "");
        URI uri = URI.create(base + "/api/player/" + uuid + "/trims");

        HttpRequest req = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofMillis(ClanCapesConfig.get().downloadTimeoutMs))
                .header("Accept", "application/json")
                .GET()
                .build();

        return httpClient.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                .thenApplyAsync(res -> {
                    if (res.statusCode() != 200) {
                        if (res.statusCode() != 404) {
                            ClanCapesClient.LOGGER.warn("API /player/{}/trims HTTP {}",
                                    uuid, res.statusCode());
                        }
                        return PlayerTrimResponse.empty();
                    }
                    try {
                        PlayerTrimResponse parsed = GSON.fromJson(res.body(),
                                PlayerTrimResponse.class);
                        return parsed != null ? parsed : PlayerTrimResponse.empty();
                    } catch (Exception e) {
                        ClanCapesClient.LOGGER.warn("API /player/{}/trims parse failed: {}",
                                uuid, e.getMessage());
                        return PlayerTrimResponse.empty();
                    }
                }, executor)
                .exceptionally(ex -> {
                    ClanCapesClient.LOGGER.warn("API /player/{}/trims failed: {}",
                            uuid, ex.getMessage());
                    return PlayerTrimResponse.empty();
                });
    }
}
