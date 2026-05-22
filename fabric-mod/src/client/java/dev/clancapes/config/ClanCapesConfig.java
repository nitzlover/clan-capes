package dev.clancapes.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import dev.clancapes.ClanCapesClient;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.multiplayer.ServerData;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;

public final class ClanCapesConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static ClanCapesConfig INSTANCE;

    /** Fallback when not on a multiplayer server (or auto-detect is off). */
    public String apiBaseUrl = "http://127.0.0.1:8080";
    /** When true, uses the server address from the multiplayer list + {@link #apiPort}. */
    public boolean autoDetectApiFromServer = true;
    /** REST port on the game host (ClanCapes plugin {@code api.port}). */
    public int apiPort = 8080;
    public int refreshIntervalSeconds = 60;
    public int cacheTtlSeconds = 300;
    public int downloadTimeoutMs = 8000;
    public int maxConcurrentDownloads = 4;
    public boolean enableVanillaCapeFallback = true;
    public boolean debugLogging = false;

    /** Set when joining a server; cleared on disconnect. */
    private transient String sessionApiBaseUrl;

    public static ClanCapesConfig get() {
        if (INSTANCE == null) {
            load();
        }
        return INSTANCE;
    }

    public static void load() {
        Path path = configPath();
        if (Files.exists(path)) {
            try (Reader reader = Files.newBufferedReader(path)) {
                INSTANCE = GSON.fromJson(reader, ClanCapesConfig.class);
            } catch (IOException e) {
                ClanCapesClient.LOGGER.warn("Failed to read config, using defaults", e);
                INSTANCE = new ClanCapesConfig();
            }
        } else {
            INSTANCE = new ClanCapesConfig();
            save();
        }
    }

    /** Active base URL for API calls (session override → file config). */
    public String getActiveApiBaseUrl() {
        if (sessionApiBaseUrl != null && !sessionApiBaseUrl.isBlank()) {
            return sessionApiBaseUrl.replaceAll("/$", "");
        }
        return apiBaseUrl.replaceAll("/$", "");
    }

    public static void setSessionApiBaseUrl(String url) {
        get().sessionApiBaseUrl = url == null || url.isBlank() ? null : url.replaceAll("/$", "");
    }

    public static void clearSessionApiBaseUrl() {
        get().sessionApiBaseUrl = null;
    }

    /** Called when the server sends an authoritative API URL over {@code clancapes:sync}. */
    public static void applyServerApiBaseUrl(String url) {
        if (url == null || url.isBlank()) {
            clearSessionApiBaseUrl();
            return;
        }
        setSessionApiBaseUrl(url);
        ClanCapesClient.LOGGER.info("Clan Capes API set by server: {}", url);
    }

    public static String resolveFromServerData(ServerData server) {
        ClanCapesConfig cfg = get();
        return ServerAddressResolver.resolveApiBaseUrl(server, cfg.apiPort);
    }

    public static void save() {
        Path path = configPath();
        try {
            Files.createDirectories(path.getParent());
            try (Writer writer = Files.newBufferedWriter(path)) {
                GSON.toJson(get(), writer);
            }
        } catch (IOException e) {
            ClanCapesClient.LOGGER.error("Failed to save config", e);
        }
    }

    private static Path configPath() {
        return FabricLoader.getInstance().getConfigDir().resolve("clancapes.json");
    }
}
