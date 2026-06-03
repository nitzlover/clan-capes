package dev.crestoria.api;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.reflect.TypeToken;
import dev.crestoria.api.dto.AnnouncementDto;
import dev.crestoria.api.dto.ApiError;
import dev.crestoria.api.dto.BannerDto;
import dev.crestoria.api.dto.ClanDto;
import dev.crestoria.api.dto.EventConfigDto;
import dev.crestoria.api.dto.InvitationDto;
import dev.crestoria.api.dto.SettingsDto;
import dev.crestoria.api.dto.TrimDto;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.logging.Logger;

/**
 * HTTP client for the Clan Capes panel API. All requests carry the
 * configured Bearer api-key. Responses are decoded with Gson into the
 * DTOs under {@code dev.crestoria.api.dto}.
 *
 * <p>All public methods are async ({@link CompletableFuture}). Callers
 * on the main Bukkit thread MUST chain with the Bukkit scheduler to get
 * back to a synchronous context before touching the world.
 */
public final class PanelClient {

    private final HttpClient http;
    private final Gson gson = new Gson();
    private final String baseUrl;
    private final String apiKey;
    private final Duration timeout;
    private final Logger log;
    private final boolean debug;

    public PanelClient(String baseUrl, String apiKey, int timeoutMs, Logger log, boolean debug) {
        this.baseUrl = stripTrailing(baseUrl);
        this.apiKey = apiKey;
        this.timeout = Duration.ofMillis(timeoutMs);
        this.log = log;
        this.debug = debug;
        this.http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    private static String stripTrailing(String s) {
        if (s == null) return "";
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }

    public boolean isConfigured() {
        return baseUrl != null && !baseUrl.isEmpty() && apiKey != null && !apiKey.isEmpty();
    }

    private HttpRequest.Builder requestBuilder(String path) {
        return HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .timeout(timeout)
                .header("Authorization", "Bearer " + apiKey)
                .header("Accept", "application/json");
    }

    private <T> CompletableFuture<T> sendJson(HttpRequest req, Class<T> type) {
        if (debug) log.info("[panel] " + req.method() + " " + req.uri());
        return http.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                .thenApply(res -> {
                    if (res.statusCode() >= 400) {
                        throw new ApiError(res.statusCode(), res.body());
                    }
                    return gson.fromJson(res.body(), type);
                });
    }

    private <T> CompletableFuture<T> sendJson(HttpRequest req, java.lang.reflect.Type type) {
        if (debug) log.info("[panel] " + req.method() + " " + req.uri());
        return http.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                .thenApply(res -> {
                    if (res.statusCode() >= 400) {
                        throw new ApiError(res.statusCode(), res.body());
                    }
                    return gson.fromJson(res.body(), type);
                });
    }

    private static HttpRequest.BodyPublisher jsonBody(Gson gson, Object payload) {
        return HttpRequest.BodyPublishers.ofString(gson.toJson(payload));
    }

    // ──────────────────────────── reads ────────────────────────────

    /** Latest published plugin version + download URL, for update nag. */
    public CompletableFuture<JsonObject> getPluginVersion() {
        HttpRequest req = requestBuilder("/api/plugin/version").GET().build();
        return sendJson(req, JsonObject.class);
    }

    public CompletableFuture<List<ClanDto>> listClans() {
        HttpRequest req = requestBuilder("/api/plugin/clans").GET().build();
        java.lang.reflect.Type envelope = new TypeToken<JsonObject>(){}.getType();
        return sendJson(req, envelope).thenApply(obj -> {
            JsonObject json = (JsonObject) obj;
            java.lang.reflect.Type listType = new TypeToken<List<ClanDto>>(){}.getType();
            return gson.fromJson(json.get("clans"), listType);
        });
    }

    public CompletableFuture<ClanDto> getClan(String tag) {
        HttpRequest req = requestBuilder("/api/plugin/clans/" + urlEncode(tag)).GET().build();
        return sendJson(req, JsonObject.class).thenApply(json -> {
            return gson.fromJson(json.get("clan"), ClanDto.class);
        });
    }

    public CompletableFuture<List<BannerDto>> listBanners() {
        HttpRequest req = requestBuilder("/api/plugin/banners").GET().build();
        return sendJson(req, JsonObject.class).thenApply(json -> {
            java.lang.reflect.Type listType = new TypeToken<List<BannerDto>>(){}.getType();
            return gson.fromJson(json.get("banners"), listType);
        });
    }

    public CompletableFuture<List<TrimDto>> listArmorTrims() {
        HttpRequest req = requestBuilder("/api/plugin/armor-trims").GET().build();
        return sendJson(req, JsonObject.class).thenApply(json -> {
            java.lang.reflect.Type listType = new TypeToken<List<TrimDto>>(){}.getType();
            return gson.fromJson(json.get("trims"), listType);
        });
    }

    public CompletableFuture<List<EventConfigDto>> listEventConfigs() {
        HttpRequest req = requestBuilder("/api/plugin/events/config").GET().build();
        return sendJson(req, JsonObject.class).thenApply(json -> {
            java.lang.reflect.Type listType = new TypeToken<List<EventConfigDto>>(){}.getType();
            return gson.fromJson(json.get("configs"), listType);
        });
    }

    public CompletableFuture<List<AnnouncementDto>> listAnnouncements() {
        HttpRequest req = requestBuilder("/api/plugin/announcements").GET().build();
        return sendJson(req, JsonObject.class).thenApply(json -> {
            java.lang.reflect.Type listType = new TypeToken<List<AnnouncementDto>>(){}.getType();
            return gson.fromJson(json.get("announcements"), listType);
        });
    }

    public CompletableFuture<SettingsDto> getSettings() {
        HttpRequest req = requestBuilder("/api/plugin/settings").GET().build();
        return sendJson(req, SettingsDto.class);
    }

    public CompletableFuture<JsonObject> getPlayerStats(UUID playerUuid) {
        HttpRequest req = requestBuilder(
                "/api/plugin/stats/player/" + playerUuid
        ).GET().build();
        return sendJson(req, JsonObject.class);
    }

    // ──────────────────────────── writes ───────────────────────────

    /** Begin an event run; panel returns the new row's {@code id}. */
    public CompletableFuture<JsonObject> postEventStart(JsonObject payload) {
        HttpRequest req = requestBuilder("/api/plugin/events/start")
                .header("Content-Type", "application/json")
                .POST(jsonBody(gson, payload))
                .build();
        return sendJson(req, JsonObject.class);
    }

    /** Finalise an event run with winner + per-participant counters. */
    public CompletableFuture<JsonObject> postEventEnd(JsonObject payload) {
        HttpRequest req = requestBuilder("/api/plugin/events/end")
                .header("Content-Type", "application/json")
                .POST(jsonBody(gson, payload))
                .build();
        return sendJson(req, JsonObject.class);
    }

    /** Log a single in-event kill. */
    public CompletableFuture<JsonObject> postEventKill(JsonObject payload) {
        HttpRequest req = requestBuilder("/api/plugin/events/kill")
                .header("Content-Type", "application/json")
                .POST(jsonBody(gson, payload))
                .build();
        return sendJson(req, JsonObject.class);
    }

    public CompletableFuture<JsonObject> postKill(UUID killer, UUID victim) {
        Map<String, Object> body = Map.of(
                "killerUuid", killer.toString(),
                "victimUuid", victim.toString(),
                "occurredAt", java.time.Instant.now().toString()
        );
        HttpRequest req = requestBuilder("/api/plugin/kills")
                .header("Content-Type", "application/json")
                .POST(jsonBody(gson, body))
                .build();
        return sendJson(req, JsonObject.class);
    }

    public CompletableFuture<JsonObject> postHeartbeat(JsonObject payload) {
        HttpRequest req = requestBuilder("/api/plugin/heartbeat")
                .header("Content-Type", "application/json")
                .POST(jsonBody(gson, payload))
                .build();
        return sendJson(req, JsonObject.class);
    }

    public CompletableFuture<ClanDto> createClan(String tag, String name, UUID leaderUuid,
                                                 String leaderName, String colorHex) {
        java.util.HashMap<String, Object> body = new java.util.HashMap<>();
        body.put("tag", tag);
        body.put("name", name);
        body.put("leaderUuid", leaderUuid.toString());
        body.put("leaderName", leaderName);
        if (colorHex != null && !colorHex.isEmpty()) body.put("colorHex", colorHex);
        HttpRequest req = requestBuilder("/api/plugin/clans")
                .header("Content-Type", "application/json")
                .POST(jsonBody(gson, body))
                .build();
        return sendJson(req, JsonObject.class).thenApply(json ->
                gson.fromJson(json.get("clan"), ClanDto.class));
    }

    /**
     * Change a member's role to "deputy" or "member" via the existing
     * PATCH /api/plugin/clans/[tag]/members/[uuid] route. Leader promotion
     * uses {@link #transferLeadership} instead — the panel route enforces
     * that distinction.
     */
    public CompletableFuture<JsonObject> updateMemberRole(String tag, UUID uuid,
                                                          String role, UUID actorUuid) {
        java.util.HashMap<String, Object> body = new java.util.HashMap<>();
        body.put("role", role);
        if (actorUuid != null) body.put("actorUuid", actorUuid.toString());
        HttpRequest req = requestBuilder(
                "/api/plugin/clans/" + urlEncode(tag) + "/members/" + uuid)
                .header("Content-Type", "application/json")
                .method("PATCH", jsonBody(gson, body))
                .build();
        return sendJson(req, JsonObject.class);
    }

    /**
     * Patch a clan's name and/or color. Pass null to leave a field
     * unchanged. Panel rejects an empty body with 400 so callers must
     * supply at least one update.
     */
    public CompletableFuture<JsonObject> updateClan(String tag, String name,
                                                    String colorHex, UUID actorUuid) {
        java.util.HashMap<String, Object> body = new java.util.HashMap<>();
        if (name != null) body.put("name", name);
        if (colorHex != null) body.put("colorHex", colorHex);
        if (actorUuid != null) body.put("actorUuid", actorUuid.toString());
        HttpRequest req = requestBuilder("/api/plugin/clans/" + urlEncode(tag))
                .header("Content-Type", "application/json")
                .method("PATCH", jsonBody(gson, body))
                .build();
        return sendJson(req, JsonObject.class);
    }

    /**
     * Disband a clan — cascades to members, banners, trims, announcements
     * server-side. The plugin treats this as terminal: the local clan
     * cache is refreshed on success so the leader's /clan info instantly
     * reports they are no longer in a clan.
     */
    /**
     * Mint a clan invitation. Plugin-side caller already gated on the
     * inviter being a leader or deputy and the invitee being a
     * never-disbanded player on this server; the panel re-verifies
     * both rules before persisting.
     */
    public CompletableFuture<InvitationDto> createInvite(String tag, UUID inviteeUuid,
                                                         String inviteeName, UUID inviterUuid,
                                                         Integer ttlSeconds) {
        java.util.HashMap<String, Object> body = new java.util.HashMap<>();
        body.put("inviteeUuid", inviteeUuid.toString());
        body.put("inviteeName", inviteeName);
        body.put("inviterUuid", inviterUuid.toString());
        if (ttlSeconds != null) body.put("ttlSeconds", ttlSeconds);
        HttpRequest req = requestBuilder("/api/plugin/clans/" + urlEncode(tag) + "/invites")
                .header("Content-Type", "application/json")
                .POST(jsonBody(gson, body))
                .build();
        return sendJson(req, JsonObject.class).thenApply(json ->
                gson.fromJson(json.get("invitation"), InvitationDto.class));
    }

    /**
     * List the pending invitations for a player on this server. The
     * panel filters on {@code status='pending' AND expires_at>now()}
     * server-side so the plugin doesn't have to re-check expiry.
     */
    public CompletableFuture<List<InvitationDto>> listPlayerInvites(UUID playerUuid) {
        HttpRequest req = requestBuilder(
                "/api/plugin/players/" + playerUuid + "/invites").GET().build();
        return sendJson(req, JsonObject.class).thenApply(json -> {
            java.lang.reflect.Type t = new TypeToken<List<InvitationDto>>(){}.getType();
            return gson.fromJson(json.get("invitations"), t);
        });
    }

    /** Accept a pending invitation; panel inserts the member row. */
    public CompletableFuture<JsonObject> acceptInvite(int inviteId, UUID playerUuid,
                                                      String playerName) {
        java.util.HashMap<String, Object> body = new java.util.HashMap<>();
        body.put("playerUuid", playerUuid.toString());
        body.put("playerName", playerName);
        body.put("actorUuid", playerUuid.toString());
        HttpRequest req = requestBuilder("/api/plugin/invites/" + inviteId + "/accept")
                .header("Content-Type", "application/json")
                .POST(jsonBody(gson, body))
                .build();
        return sendJson(req, JsonObject.class);
    }

    /** Decline a pending invitation. */
    public CompletableFuture<JsonObject> declineInvite(int inviteId, UUID playerUuid) {
        java.util.HashMap<String, Object> body = new java.util.HashMap<>();
        body.put("playerUuid", playerUuid.toString());
        body.put("actorUuid", playerUuid.toString());
        HttpRequest req = requestBuilder("/api/plugin/invites/" + inviteId + "/decline")
                .header("Content-Type", "application/json")
                .POST(jsonBody(gson, body))
                .build();
        return sendJson(req, JsonObject.class);
    }

    public CompletableFuture<JsonObject> deleteClan(String tag, UUID actorUuid) {
        HttpRequest req = requestBuilder("/api/plugin/clans/" + urlEncode(tag))
                .header("Content-Type", "application/json")
                .method("DELETE", actorUuid != null
                        ? jsonBody(gson, Map.of("actorUuid", actorUuid.toString()))
                        : HttpRequest.BodyPublishers.noBody())
                .build();
        return sendJson(req, JsonObject.class);
    }

    public CompletableFuture<JsonObject> removeMember(String tag, UUID uuid, UUID actorUuid) {
        String path = "/api/plugin/clans/" + urlEncode(tag) + "/members/" + uuid;
        HttpRequest req = requestBuilder(path)
                .header("Content-Type", "application/json")
                .method("DELETE", actorUuid != null
                        ? jsonBody(gson, Map.of("actorUuid", actorUuid.toString()))
                        : HttpRequest.BodyPublishers.noBody())
                .build();
        return sendJson(req, JsonObject.class);
    }

    public CompletableFuture<JsonObject> transferLeadership(String tag, UUID newLeader, UUID actorUuid) {
        java.util.HashMap<String, Object> body = new java.util.HashMap<>();
        body.put("newLeaderUuid", newLeader.toString());
        if (actorUuid != null) body.put("actorUuid", actorUuid.toString());
        HttpRequest req = requestBuilder("/api/plugin/clans/" + urlEncode(tag) + "/transfer")
                .header("Content-Type", "application/json")
                .POST(jsonBody(gson, body))
                .build();
        return sendJson(req, JsonObject.class);
    }

    public CompletableFuture<JsonObject> issueLeaderToken(UUID playerUuid, int ttlSec) {
        Map<String, Object> body = Map.of(
                "playerUuid", playerUuid.toString(),
                "expiresInSec", ttlSec
        );
        HttpRequest req = requestBuilder("/api/leader/issue-token")
                .header("Content-Type", "application/json")
                .POST(jsonBody(gson, body))
                .build();
        return sendJson(req, JsonObject.class);
    }

    private static String urlEncode(String s) {
        return java.net.URLEncoder.encode(s, java.nio.charset.StandardCharsets.UTF_8);
    }
}
