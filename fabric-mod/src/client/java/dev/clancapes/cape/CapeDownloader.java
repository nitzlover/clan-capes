package dev.clancapes.cape;

import com.mojang.blaze3d.platform.NativeImage;
import dev.clancapes.config.ClanCapesConfig;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.Semaphore;

public final class CapeDownloader {
    private static final int[] VALID_WIDTHS = {64, 128};
    private static final int[] VALID_HEIGHTS = {32, 64};

    private final HttpClient httpClient;
    private final Executor executor;
    private final Semaphore concurrency;

    public CapeDownloader(Executor executor) {
        this.executor = executor;
        this.concurrency = new Semaphore(ClanCapesConfig.get().maxConcurrentDownloads);
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(ClanCapesConfig.get().downloadTimeoutMs))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
    }

    public CompletableFuture<NativeImage> download(String url) {
        return CompletableFuture.supplyAsync(() -> {
            try {
                concurrency.acquire();
                HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                        .timeout(Duration.ofMillis(ClanCapesConfig.get().downloadTimeoutMs))
                        .header("Accept", "image/png")
                        .GET()
                        .build();

                HttpResponse<InputStream> response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
                if (response.statusCode() != 200) {
                    return null;
                }
                try (InputStream stream = response.body()) {
                    NativeImage image = NativeImage.read(stream);
                    if (!isValidCapeSize(image.getWidth(), image.getHeight())) {
                        image.close();
                        return null;
                    }
                    return image;
                }
            } catch (Exception e) {
                return null;
            } finally {
                concurrency.release();
            }
        }, executor);
    }

    public static boolean isValidCapeSize(int width, int height) {
        for (int i = 0; i < VALID_WIDTHS.length; i++) {
            if (width == VALID_WIDTHS[i] && height == VALID_HEIGHTS[i]) {
                return true;
            }
        }
        return false;
    }
}
