package dev.clancapes.api;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.config.PluginConfig;
import dev.clancapes.hook.PowerClansHook;
import dev.clancapes.model.ClanCapeRecord;
import dev.clancapes.model.PlayerCapeDto;
import dev.clancapes.model.PowerClanEntry;
import dev.clancapes.service.CapeService;
import io.javalin.Javalin;
import io.javalin.http.Context;
import io.javalin.http.HttpStatus;
import io.javalin.json.JsonMapper;
import org.jetbrains.annotations.NotNull;

import java.lang.reflect.Type;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class RestApiServer {
    private static final Gson GSON = new GsonBuilder().create();

    private final ClanCapesPlugin plugin;
    private final CapeService capeService;
    private final PluginConfig config;
    private final PowerClansHook powerClansHook;
    private Javalin app;

    public RestApiServer(ClanCapesPlugin plugin, CapeService capeService, PluginConfig config, PowerClansHook powerClansHook) {
        this.plugin = plugin;
        this.capeService = capeService;
        this.config = config;
        this.powerClansHook = powerClansHook;
    }

    public void start() {
        app = Javalin.create(cfg -> {
            cfg.showJavalinBanner = false;
            cfg.jsonMapper(new JsonMapper() {
                @Override
                public @NotNull String toJsonString(@NotNull Object obj, @NotNull Type type) {
                    return GSON.toJson(obj, type);
                }

                @Override
                public <T> @NotNull T fromJsonString(@NotNull String json, @NotNull Type targetType) {
                    return GSON.fromJson(json, targetType);
                }
            });
        });

        app.before(ctx -> {
            ctx.header("Access-Control-Allow-Origin", String.join(",", config.getCorsOrigins()));
            ctx.header("Access-Control-Allow-Headers", "Content-Type, X-ClanCapes-Token");
            ctx.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
            ctx.attribute("clancapes-start", System.currentTimeMillis());
            if ("OPTIONS".equalsIgnoreCase(ctx.method().name())) {
                ctx.status(HttpStatus.OK);
            }
        });

        app.after(ctx -> {
            if (!config.isDebugLogging()) {
                return;
            }
            Long start = ctx.attribute("clancapes-start");
            long ms = start == null ? 0 : System.currentTimeMillis() - start;
            plugin.getLogger().info(String.format(
                    "REST %s %s -> %d (%dms) ip=%s",
                    ctx.method().name(), ctx.path(), ctx.statusCode(), ms, ctx.ip()));
        });

        app.exception(Exception.class, (e, ctx) -> {
            plugin.getLogger().warning("REST " + ctx.method().name() + " " + ctx.path()
                    + " failed: " + e.getMessage());
            ctx.status(HttpStatus.INTERNAL_SERVER_ERROR).json(Map.of("error", "internal"));
        });

        app.get("/api/player/{uuid}", this::getPlayer);
        app.get("/api/powerclans/clans", this::listPowerClans);
        app.get("/api/clan/{tag}", this::getClan);
        app.post("/api/clan/{tag}/cape", this::setClanCape);
        app.delete("/api/clan/{tag}/cape", this::deleteClanCape);
        app.get("/api/health", ctx -> ctx.json(Map.of("status", "ok")));

        app.start(config.getApiHost(), config.getApiPort());
        plugin.getLogger().info("REST API listening on " + config.getApiHost() + ":" + config.getApiPort());
    }

    public void stop() {
        if (app != null) {
            app.stop();
        }
    }

    private void getPlayer(Context ctx) {
        try {
            UUID uuid = UUID.fromString(ctx.pathParam("uuid"));
            PlayerCapeDto dto = capeService.resolvePlayer(uuid);
            ctx.contentType("application/json");
            ctx.result(GSON.toJson(dto));
        } catch (IllegalArgumentException e) {
            ctx.status(HttpStatus.BAD_REQUEST).result("{\"error\":\"invalid uuid\"}");
        }
    }

    private void listPowerClans(Context ctx) {
        if (!isAuthorized(ctx)) {
            ctx.status(HttpStatus.UNAUTHORIZED);
            return;
        }
        List<PowerClanEntry> clans = powerClansHook.listClans();
        List<Map<String, Object>> body = clans.stream()
                .map(c -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", c.id());
                    row.put("tag", c.tag());
                    row.put("leader", c.leader());
                    row.put("level", c.level());
                    return row;
                })
                .toList();
        ctx.json(Map.of("clans", body));
    }

    private void getClan(Context ctx) {
        String tag = ctx.pathParam("tag").toUpperCase();
        capeService.getClanCape(tag).ifPresentOrElse(
                record -> ctx.json(toClanJson(record)),
                () -> ctx.status(HttpStatus.NOT_FOUND).json(Map.of("error", "not found"))
        );
    }

    private void setClanCape(Context ctx) {
        if (!isAuthorized(ctx)) {
            ctx.status(HttpStatus.UNAUTHORIZED);
            return;
        }
        String tag = ctx.pathParam("tag").toUpperCase();
        CapeSetRequest body = GSON.fromJson(ctx.body(), CapeSetRequest.class);
        if (body == null || body.capeUrl() == null || body.capeUrl().isBlank()) {
            ctx.status(HttpStatus.BAD_REQUEST).json(Map.of("error", "capeUrl required"));
            return;
        }
        try {
            capeService.setCapeUrl(tag, body.capeUrl(), body.actor() != null ? body.actor() : "api");
            ctx.json(Map.of("ok", true, "clan", tag, "capeUrl", body.capeUrl()));
        } catch (Exception e) {
            ctx.status(HttpStatus.BAD_REQUEST).json(Map.of("error", e.getMessage()));
        }
    }

    private void deleteClanCape(Context ctx) {
        if (!isAuthorized(ctx)) {
            ctx.status(HttpStatus.UNAUTHORIZED);
            return;
        }
        String tag = ctx.pathParam("tag").toUpperCase();
        capeService.removeCape(tag, "api");
        ctx.json(Map.of("ok", true, "clan", tag));
    }

    private boolean isAuthorized(Context ctx) {
        String token = ctx.header("X-ClanCapes-Token");
        return config.getApiToken() != null && config.getApiToken().equals(token);
    }

    private static Map<String, Object> toClanJson(ClanCapeRecord record) {
        return Map.of(
                "clan", record.clanTag(),
                "capeUrl", record.capeUrl(),
                "fileName", record.fileName() != null ? record.fileName() : "",
                "updatedAt", record.updatedAt(),
                "updatedBy", record.updatedBy() != null ? record.updatedBy() : ""
        );
    }

    private record CapeSetRequest(String capeUrl, String actor) {
    }
}
