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

    // ──────── Clan reads (Phase 2.1) ──────────────────────────────────

    /**
     * GET /api/plugin/clans — list every active clan on this server.
     * Wraps any non-2xx into {@link PanelException} so callers can do
     * single-catch error handling; 404 doesn't apply here because the
     * list endpoint always returns 200 with a (possibly empty) array.
     */
    public java.util.List<dev.clancapes.clan.Clan> fetchClans(String panelUrl, String apiKey)
            throws PanelException {
        String url = panelUrl.replaceAll("/+$", "") + "/api/plugin/clans";
        HttpResponse<String> res = sendAuthed(url, apiKey, "GET", null);
        if (res.statusCode() / 100 != 2) {
            throw new PanelException(errorMessage(res.body(), "HTTP " + res.statusCode()));
        }
        try {
            ClanListResponse parsed = gson.fromJson(res.body(), ClanListResponse.class);
            return parsed != null && parsed.clans != null ? parsed.clans : java.util.List.of();
        } catch (Exception e) {
            throw new PanelException("malformed clans response: " + res.body(), e);
        }
    }

    /**
     * GET /api/plugin/clans/{tag} — single lookup. Returns null on 404
     * so callers can branch without catching PanelException for a
     * legitimate miss.
     */
    public dev.clancapes.clan.Clan fetchClanByTag(String panelUrl, String apiKey, String tag)
            throws PanelException {
        String url = panelUrl.replaceAll("/+$", "") + "/api/plugin/clans/"
                + java.net.URLEncoder.encode(tag, java.nio.charset.StandardCharsets.UTF_8);
        HttpResponse<String> res = sendAuthed(url, apiKey, "GET", null);
        if (res.statusCode() == 404) return null;
        if (res.statusCode() / 100 != 2) {
            throw new PanelException(errorMessage(res.body(), "HTTP " + res.statusCode()));
        }
        try {
            return gson.fromJson(res.body(), ClanResponse.class).clan;
        } catch (Exception e) {
            throw new PanelException("malformed clan response: " + res.body(), e);
        }
    }

    /**
     * GET /api/plugin/players/{uuid}/clan — resolve a player to their
     * clan on this server. Returns null when the player is unclanned
     * (panel responds with 404).
     */
    public dev.clancapes.clan.Clan fetchClanForPlayer(String panelUrl, String apiKey,
                                                       java.util.UUID uuid) throws PanelException {
        String url = panelUrl.replaceAll("/+$", "") + "/api/plugin/players/"
                + uuid + "/clan";
        HttpResponse<String> res = sendAuthed(url, apiKey, "GET", null);
        if (res.statusCode() == 404) return null;
        if (res.statusCode() / 100 != 2) {
            throw new PanelException(errorMessage(res.body(), "HTTP " + res.statusCode()));
        }
        try {
            return gson.fromJson(res.body(), ClanResponse.class).clan;
        } catch (Exception e) {
            throw new PanelException("malformed clan response: " + res.body(), e);
        }
    }

    // ──────── Clan writes (Phase 2.2-2.4) ─────────────────────────────

    /** POST /api/plugin/clans — create a new clan. */
    public dev.clancapes.clan.Clan createClan(String panelUrl, String apiKey,
                                               String tag, String name,
                                               java.util.UUID leaderUuid, String leaderName,
                                               String colorHex) throws PanelException {
        JsonObject body = new JsonObject();
        body.addProperty("tag", tag);
        body.addProperty("name", name);
        body.addProperty("leaderUuid", leaderUuid.toString());
        body.addProperty("leaderName", leaderName);
        if (colorHex != null && !colorHex.isBlank()) body.addProperty("colorHex", colorHex);
        return mutationClan(panelUrl + "/api/plugin/clans", apiKey, "POST", body);
    }

    /** PATCH /api/plugin/clans/{tag} — rename / recolor. */
    public dev.clancapes.clan.Clan editClan(String panelUrl, String apiKey, String tag,
                                              String newName, String newColorHex,
                                              java.util.UUID actorUuid) throws PanelException {
        JsonObject body = new JsonObject();
        if (newName != null) body.addProperty("name", newName);
        if (newColorHex != null) body.addProperty("colorHex", newColorHex);
        if (actorUuid != null) body.addProperty("actorUuid", actorUuid.toString());
        String url = panelUrl + "/api/plugin/clans/" + urlEnc(tag);
        return mutationClan(url, apiKey, "PATCH", body);
    }

    /** DELETE /api/plugin/clans/{tag} — disband. */
    public void disbandClan(String panelUrl, String apiKey, String tag,
                            java.util.UUID actorUuid) throws PanelException {
        JsonObject body = new JsonObject();
        if (actorUuid != null) body.addProperty("actorUuid", actorUuid.toString());
        String url = panelUrl + "/api/plugin/clans/" + urlEnc(tag);
        HttpResponse<String> res = sendAuthed(url, apiKey, "DELETE", gson.toJson(body));
        if (res.statusCode() / 100 != 2) {
            throw new PanelException(errorMessage(res.body(), "HTTP " + res.statusCode()));
        }
    }

    /** POST /api/plugin/clans/{tag}/members — add member. */
    public dev.clancapes.clan.Clan addMember(String panelUrl, String apiKey, String tag,
                                              java.util.UUID playerUuid, String playerName,
                                              dev.clancapes.clan.ClanMember.Role role,
                                              java.util.UUID actorUuid) throws PanelException {
        JsonObject body = new JsonObject();
        body.addProperty("playerUuid", playerUuid.toString());
        body.addProperty("playerName", playerName);
        if (role != null) body.addProperty("role", role.name().toLowerCase());
        if (actorUuid != null) body.addProperty("actorUuid", actorUuid.toString());
        String url = panelUrl + "/api/plugin/clans/" + urlEnc(tag) + "/members";
        return mutationClan(url, apiKey, "POST", body);
    }

    /** PATCH /api/plugin/clans/{tag}/members/{uuid} — promote / demote. */
    public dev.clancapes.clan.Clan changeRole(String panelUrl, String apiKey, String tag,
                                                java.util.UUID playerUuid,
                                                dev.clancapes.clan.ClanMember.Role role,
                                                java.util.UUID actorUuid) throws PanelException {
        JsonObject body = new JsonObject();
        body.addProperty("role", role.name().toLowerCase());
        if (actorUuid != null) body.addProperty("actorUuid", actorUuid.toString());
        String url = panelUrl + "/api/plugin/clans/" + urlEnc(tag) + "/members/" + playerUuid;
        return mutationClan(url, apiKey, "PATCH", body);
    }

    /** DELETE /api/plugin/clans/{tag}/members/{uuid} — kick / leave. */
    public void removeMember(String panelUrl, String apiKey, String tag,
                              java.util.UUID playerUuid, java.util.UUID actorUuid)
            throws PanelException {
        JsonObject body = new JsonObject();
        if (actorUuid != null) body.addProperty("actorUuid", actorUuid.toString());
        String url = panelUrl + "/api/plugin/clans/" + urlEnc(tag) + "/members/" + playerUuid;
        HttpResponse<String> res = sendAuthed(url, apiKey, "DELETE", gson.toJson(body));
        if (res.statusCode() / 100 != 2) {
            throw new PanelException(errorMessage(res.body(), "HTTP " + res.statusCode()));
        }
    }

    /** POST /api/plugin/clans/{tag}/transfer — hand over leadership. */
    public dev.clancapes.clan.Clan transferLeader(String panelUrl, String apiKey, String tag,
                                                    java.util.UUID newLeaderUuid,
                                                    java.util.UUID actorUuid) throws PanelException {
        JsonObject body = new JsonObject();
        body.addProperty("newLeaderUuid", newLeaderUuid.toString());
        if (actorUuid != null) body.addProperty("actorUuid", actorUuid.toString());
        String url = panelUrl + "/api/plugin/clans/" + urlEnc(tag) + "/transfer";
        return mutationClan(url, apiKey, "POST", body);
    }

    /** Helper: every mutation endpoint that returns the updated clan. */
    private dev.clancapes.clan.Clan mutationClan(String url, String apiKey, String method,
                                                  JsonObject body) throws PanelException {
        HttpResponse<String> res = sendAuthed(url, apiKey, method,
                body == null ? null : gson.toJson(body));
        if (res.statusCode() / 100 != 2) {
            throw new PanelException(errorMessage(res.body(), "HTTP " + res.statusCode()));
        }
        try {
            return gson.fromJson(res.body(), ClanResponse.class).clan;
        } catch (Exception e) {
            throw new PanelException("malformed clan response: " + res.body(), e);
        }
    }

    private static String urlEnc(String s) {
        return java.net.URLEncoder.encode(s, java.nio.charset.StandardCharsets.UTF_8);
    }

    /**
     * Internal helper — builds a Bearer-authed request with the standard
     * user agent + JSON content type, sends it, surfaces transport
     * failures as {@link PanelException}.
     */
    private HttpResponse<String> sendAuthed(String url, String apiKey, String method, String body)
            throws PanelException {
        HttpRequest.Builder b = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(15))
                .header("Authorization", "Bearer " + apiKey)
                .header("User-Agent", "ClanCapes-Paper/" + plugin.getDescription().getVersion());
        if (body != null) {
            b.header("Content-Type", "application/json");
            b.method(method, HttpRequest.BodyPublishers.ofString(body));
        } else if ("GET".equalsIgnoreCase(method)) {
            b.GET();
        } else {
            b.method(method, HttpRequest.BodyPublishers.noBody());
        }
        try {
            return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            throw new PanelException(method + " " + url + " transport: " + e.getMessage(), e);
        }
    }

    private static final class ClanListResponse {
        java.util.List<dev.clancapes.clan.Clan> clans;
    }

    private static final class ClanResponse {
        dev.clancapes.clan.Clan clan;
    }

    // ──────── Banner reads (Phase 3 — auto-paint) ─────────────────────

    /**
     * GET /api/plugin/banners — bulk list of every active clan's
     * banner spec on this server. Used to prime the in-memory
     * BannerRepository cache.
     */
    public java.util.List<dev.clancapes.model.ClanBannerRecord> fetchBanners(
            String panelUrl, String apiKey) throws PanelException {
        String url = panelUrl.replaceAll("/+$", "") + "/api/plugin/banners";
        HttpResponse<String> res = sendAuthed(url, apiKey, "GET", null);
        if (res.statusCode() / 100 != 2) {
            throw new PanelException(errorMessage(res.body(), "HTTP " + res.statusCode()));
        }
        try {
            BannerListResponse parsed = gson.fromJson(res.body(), BannerListResponse.class);
            if (parsed == null || parsed.banners == null) return java.util.List.of();
            java.util.List<dev.clancapes.model.ClanBannerRecord> out =
                    new java.util.ArrayList<>(parsed.banners.size());
            for (BannerJson b : parsed.banners) {
                out.add(b.toRecord());
            }
            return out;
        } catch (Exception e) {
            throw new PanelException("malformed banners response: " + res.body(), e);
        }
    }

    /**
     * GET /api/plugin/clans/{tag}/banner — single-tag lookup. Returns
     * null on 404 so the caller can treat "clan has no banner" as a
     * non-error.
     */
    public dev.clancapes.model.ClanBannerRecord fetchBannerByTag(
            String panelUrl, String apiKey, String tag) throws PanelException {
        String url = panelUrl.replaceAll("/+$", "")
                + "/api/plugin/clans/" + urlEnc(tag) + "/banner";
        HttpResponse<String> res = sendAuthed(url, apiKey, "GET", null);
        if (res.statusCode() == 404) return null;
        if (res.statusCode() / 100 != 2) {
            throw new PanelException(errorMessage(res.body(), "HTTP " + res.statusCode()));
        }
        try {
            BannerJson parsed = gson.fromJson(res.body(), BannerJson.class);
            return parsed == null ? null : parsed.toRecord();
        } catch (Exception e) {
            throw new PanelException("malformed banner response: " + res.body(), e);
        }
    }

    /** Wire shape of a single banner row in panel responses. */
    private static final class BannerJson {
        String clan;
        int baseColor;
        java.util.List<dev.clancapes.model.BannerPatternSpec> patterns;
        String updatedAt;
        String updatedBy;

        dev.clancapes.model.ClanBannerRecord toRecord() {
            long ts = 0L;
            try {
                if (updatedAt != null) {
                    ts = java.time.Instant.parse(updatedAt).toEpochMilli();
                }
            } catch (Exception ignored) {
                // Leave ts = 0 — the field is only audit-informational.
            }
            return new dev.clancapes.model.ClanBannerRecord(
                    clan == null ? "" : clan.toUpperCase(),
                    baseColor,
                    patterns == null ? java.util.List.of() : patterns,
                    ts,
                    updatedBy == null ? "panel" : updatedBy
            );
        }
    }

    private static final class BannerListResponse {
        java.util.List<BannerJson> banners;
    }

    // ──────── Leader-panel handshake (Phase 4) ─────────────────────────

    /**
     * POST /api/leader/issue-token — mint a short-lived single-use
     * token bound to the player's UUID. Plugin shows the resulting
     * URL (or raw token) to the player so they can sign into
     * /clan-panel without a separate password.
     */
    public LeaderTokenResponse issueLeaderToken(
            String panelUrl, String apiKey, java.util.UUID playerUuid, int expiresInSec)
            throws PanelException {
        JsonObject body = new JsonObject();
        body.addProperty("playerUuid", playerUuid.toString());
        if (expiresInSec > 0) body.addProperty("expiresInSec", expiresInSec);
        String url = panelUrl.replaceAll("/+$", "") + "/api/leader/issue-token";
        HttpResponse<String> res = sendAuthed(url, apiKey, "POST", gson.toJson(body));
        if (res.statusCode() / 100 != 2) {
            throw new PanelException(errorMessage(res.body(), "HTTP " + res.statusCode()));
        }
        try {
            return gson.fromJson(res.body(), LeaderTokenResponse.class);
        } catch (Exception e) {
            throw new PanelException("malformed leader-token response: " + res.body(), e);
        }
    }

    public static final class LeaderTokenResponse {
        public boolean ok;
        public String token;
        public String expiresAt;
        public String url;
    }

    // ──────── Stats (Phase 5) ─────────────────────────────────────────

    /**
     * POST /api/plugin/kills — ship a single PvP kill to the panel.
     * The body is built by the caller so future fields (occurredAt,
     * weapon, …) don't require a signature change.
     */
    public void recordKill(String panelUrl, String apiKey, JsonObject body)
            throws PanelException {
        String url = panelUrl.replaceAll("/+$", "") + "/api/plugin/kills";
        HttpResponse<String> res = sendAuthed(url, apiKey, "POST",
                gson.toJson(body == null ? new JsonObject() : body));
        if (res.statusCode() / 100 != 2) {
            throw new PanelException(errorMessage(res.body(), "HTTP " + res.statusCode()));
        }
    }

    /**
     * GET /api/plugin/settings — fetch live operator-set knobs
     * (palette, cooldown, banner max layers). Returned as a loose
     * map so SettingsCache can read just the fields it needs without
     * a per-field DTO.
     */
    public java.util.Map<String, Object> fetchSettings(String panelUrl, String apiKey)
            throws PanelException {
        String url = panelUrl.replaceAll("/+$", "") + "/api/plugin/settings";
        HttpResponse<String> res = sendAuthed(url, apiKey, "GET", null);
        if (res.statusCode() / 100 != 2) {
            throw new PanelException(errorMessage(res.body(), "HTTP " + res.statusCode()));
        }
        try {
            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> parsed =
                    gson.fromJson(res.body(), java.util.Map.class);
            return parsed != null ? parsed : java.util.Map.of();
        } catch (Exception e) {
            throw new PanelException("malformed settings response: " + res.body(), e);
        }
    }

    /**
     * GET /api/plugin/stats/player/{uuid} — season + lifetime counters
     * for the placeholder cache. Returned as a loose-typed map so the
     * caller picks the fields it needs without dragging a DTO class
     * across modules.
     */
    public java.util.Map<String, Object> fetchPlayerStats(
            String panelUrl, String apiKey, java.util.UUID uuid) throws PanelException {
        String url = panelUrl.replaceAll("/+$", "")
                + "/api/plugin/stats/player/" + uuid;
        HttpResponse<String> res = sendAuthed(url, apiKey, "GET", null);
        if (res.statusCode() / 100 != 2) {
            throw new PanelException(errorMessage(res.body(), "HTTP " + res.statusCode()));
        }
        try {
            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> parsed =
                    gson.fromJson(res.body(), java.util.Map.class);
            return parsed != null ? parsed : java.util.Map.of();
        } catch (Exception e) {
            throw new PanelException("malformed stats response: " + res.body(), e);
        }
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
