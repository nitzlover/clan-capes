package dev.clancapes.panel;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import dev.clancapes.ClanCapesPlugin;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.logging.Level;

/**
 * Thin HTTP client for the web panel.
 * <p>
 * Phase 1 only uses two endpoints:
 * <ul>
 *   <li>{@code POST /api/setup/register} — plugin registers a fresh
 *       one-time-pass token before the operator pastes it into the
 *       admin UI.</li>
 *   <li>{@code POST /api/setup/consume} — admin-only, never called
 *       from here. The plugin instead receives the resulting API key
 *       via {@code /clancape link <ck_live_…>} from the operator.</li>
 * </ul>
 * <p>
 * Later phases will add authenticated endpoints (clan CRUD, kill events
 * etc.) that this client will sign with the Bearer API key persisted in
 * {@code config.yml}. For now we only expose {@link #registerSetupToken}
 * and the token-generation helper.
 */
public final class PanelClient {
    private static final String SETUP_PREFIX = "setup_";
    private static final SecureRandom RNG = new SecureRandom();

    private final ClanCapesPlugin plugin;
    private final HttpClient http;
    private final Gson gson = new Gson();

    public PanelClient(ClanCapesPlugin plugin) {
        this.plugin = plugin;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * Generate a fresh {@code setup_<43 url-safe-base64 chars>} token.
     * Matches the format the panel validates against. Stored nowhere on
     * the plugin side — the plaintext only lives in the operator's
     * chat until they paste it into the admin UI.
     */
    public static String generateSetupToken() {
        byte[] bytes = new byte[32];
        RNG.nextBytes(bytes);
        return SETUP_PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /**
     * POST the token to {@code /api/setup/register} so the panel knows
     * to expect it. Returns the API response on 2xx, throws on every
     * other status with a human-readable message extracted from the
     * JSON body when possible.
     */
    public RegisterResponse registerSetupToken(String panelUrl, String token, String serverName)
            throws PanelException {
        String url = panelUrl.replaceAll("/+$", "") + "/api/setup/register";

        JsonObject body = new JsonObject();
        body.addProperty("token", token);
        body.addProperty("serverName", serverName);

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json")
                .header("User-Agent", "ClanCapes-Paper/" + plugin.getDescription().getVersion())
                .POST(HttpRequest.BodyPublishers.ofString(gson.toJson(body)))
                .build();

        HttpResponse<String> res;
        try {
            res = http.send(req, HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            plugin.getLogger().log(Level.WARNING, "panel /setup/register transport failure", e);
            throw new PanelException("could not reach panel: " + e.getMessage(), e);
        }

        if (res.statusCode() / 100 != 2) {
            String msg = errorMessage(res.body(), "HTTP " + res.statusCode());
            throw new PanelException(msg);
        }
        try {
            return gson.fromJson(res.body(), RegisterResponse.class);
        } catch (Exception e) {
            throw new PanelException("malformed panel response: " + res.body(), e);
        }
    }

    private String errorMessage(String body, String fallback) {
        if (body == null || body.isEmpty()) return fallback;
        try {
            JsonObject obj = gson.fromJson(body, JsonObject.class);
            if (obj != null && obj.has("error")) {
                return obj.get("error").getAsString();
            }
        } catch (Exception ignored) {
            // Not JSON — fall through.
        }
        return fallback + ": " + body;
    }

    public static final class RegisterResponse {
        public boolean ok;
        public String expiresAt;
        public long ttlSeconds;
    }

    /**
     * Authenticated heartbeat ping. POSTs an optional telemetry body to
     * {@code /api/plugin/heartbeat} with the configured API key as
     * Bearer. The panel uses this to refresh {@code servers.last_seen_at}
     * and surface the online/stale/offline pill in the admin UI.
     * Surfaces a 401 as {@link PanelException} so the scheduled task
     * can log and back off — most other errors are treated as transient.
     */
    public HeartbeatResponse heartbeat(String panelUrl, String apiKey, JsonObject body)
            throws PanelException {
        String url = panelUrl.replaceAll("/+$", "") + "/api/plugin/heartbeat";
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .header("User-Agent", "ClanCapes-Paper/" + plugin.getDescription().getVersion())
                .POST(HttpRequest.BodyPublishers.ofString(
                        gson.toJson(body == null ? new JsonObject() : body)))
                .build();
        HttpResponse<String> res;
        try {
            res = http.send(req, HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            throw new PanelException("heartbeat transport: " + e.getMessage(), e);
        }
        if (res.statusCode() == 401) {
            throw new PanelException("API key rejected by panel (HTTP 401)");
        }
        if (res.statusCode() / 100 != 2) {
            throw new PanelException(errorMessage(res.body(), "HTTP " + res.statusCode()));
        }
        try {
            return gson.fromJson(res.body(), HeartbeatResponse.class);
        } catch (Exception e) {
            throw new PanelException("malformed heartbeat response: " + res.body(), e);
        }
    }

    public static final class HeartbeatResponse {
        public boolean ok;
        public ServerStub server;
        public String serverTime;
    }

    public static final class ServerStub {
        public int id;
        public String name;
    }

    /** Raised on any non-2xx response or transport failure. */
    public static final class PanelException extends Exception {
        public PanelException(String message) {
            super(message);
        }
        public PanelException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
