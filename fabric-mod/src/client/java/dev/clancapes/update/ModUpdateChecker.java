package dev.clancapes.update;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import dev.clancapes.ClanCapesClient;
import dev.clancapes.ClanCapesMod;
import dev.clancapes.config.ClanCapesConfig;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Polls the panel's {@code /api/mod/version} on first world join and, if the
 * panel advertises a newer version than this jar, nags the player ONCE per
 * session with the download URL (Minecraft auto-linkifies the plain URL in
 * chat, so no fragile ClickEvent API is needed). Never auto-installs — Fabric
 * can't hot-swap, so the player downloads + drops the jar in manually.
 */
public final class ModUpdateChecker {

    private static final Gson GSON = new Gson();
    private static final AtomicBoolean NOTIFIED = new AtomicBoolean(false);
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private ModUpdateChecker() {
    }

    public static void checkOnJoin(Minecraft client) {
        if (NOTIFIED.get()) {
            return; // already nagged this session
        }
        String base = ClanCapesConfig.get().apiBaseUrl.replaceAll("/$", "");
        URI uri = URI.create(base + "/api/mod/version");
        HttpRequest req = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(5))
                .header("Accept", "application/json")
                .GET()
                .build();

        HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                .thenAccept(resp -> {
                    if (resp.statusCode() != 200) {
                        return;
                    }
                    try {
                        JsonObject json = GSON.fromJson(resp.body(), JsonObject.class);
                        if (json == null || !json.has("latest")) {
                            return;
                        }
                        String latest = json.get("latest").getAsString();
                        String url = json.has("downloadUrl") && !json.get("downloadUrl").isJsonNull()
                                ? json.get("downloadUrl").getAsString()
                                : "";
                        String current = currentVersion();
                        if (compareSemver(latest, current) <= 0) {
                            return; // up to date or panel behind (downgrade) — stay quiet
                        }
                        if (!NOTIFIED.compareAndSet(false, true)) {
                            return;
                        }
                        client.execute(() -> notifyPlayer(client, current, latest, url));
                    } catch (Throwable t) {
                        ClanCapesClient.LOGGER.warn("mod version check parse failed: {}", t.toString());
                    }
                })
                .exceptionally(t -> null);
    }

    private static void notifyPlayer(Minecraft client, String current, String latest, String url) {
        if (client.player == null) {
            return;
        }
        String text = "[ClanCapes] Mod update available: " + current + " → " + latest
                + (url.isEmpty()
                        ? " (ask an admin for the new jar)"
                        : ". Download: " + url + "  — replace the jar in your mods folder + restart.");
        client.player.sendSystemMessage(
                Component.literal(text).withStyle(ChatFormatting.GOLD));
    }

    private static String currentVersion() {
        return FabricLoader.getInstance().getModContainer(ClanCapesMod.MOD_ID)
                .map(c -> c.getMetadata().getVersion().getFriendlyString())
                .orElse("0.0.0");
    }

    /** Negative when a &lt; b, zero when equal, positive when a &gt; b. */
    static int compareSemver(String a, String b) {
        String[] ap = a.split("\\.");
        String[] bp = b.split("\\.");
        int n = Math.max(ap.length, bp.length);
        for (int i = 0; i < n; i++) {
            int ai = parseLead(i < ap.length ? ap[i] : "0");
            int bi = parseLead(i < bp.length ? bp[i] : "0");
            if (ai != bi) {
                return Integer.compare(ai, bi);
            }
        }
        return 0;
    }

    private static int parseLead(String s) {
        StringBuilder d = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c >= '0' && c <= '9') {
                d.append(c);
            } else {
                break;
            }
        }
        return d.length() == 0 ? 0 : Integer.parseInt(d.toString());
    }
}
