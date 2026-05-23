package dev.clancapes.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import dev.clancapes.ClanCapesClient;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.file.Files;
import java.nio.file.Path;

public final class ClanCapesConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static ClanCapesConfig INSTANCE;

    /**
     * Default plugin REST endpoint baked into the jar so a freshly-
     * installed mod works without any manual config edit on first launch.
     * Tracks the production Paper plugin running alongside the MC server.
     */
    public static final String DEFAULT_API_BASE_URL = "http://23.109.45.71:5897";

    /**
     * Any config still pointing at one of these legacy/dev defaults is
     * silently rewritten to {@link #DEFAULT_API_BASE_URL} on load. This is
     * how older shipped builds (which defaulted to localhost) self-heal
     * after the user updates the jar — no manual cleanup required.
     */
    private static final String[] STALE_DEFAULT_URLS = {
            "http://127.0.0.1:8080",
            "http://localhost:8080",
            "http://127.0.0.1:5897",
            "http://localhost:5897",
    };

    public String apiBaseUrl = DEFAULT_API_BASE_URL;
    public int refreshIntervalSeconds = 60;
    public int cacheTtlSeconds = 300;
    public int downloadTimeoutMs = 8000;
    public int maxConcurrentDownloads = 4;
    public boolean enableVanillaCapeFallback = true;
    public boolean debugLogging = false;

    public static ClanCapesConfig get() {
        if (INSTANCE == null) {
            load();
        }
        return INSTANCE;
    }

    public static void load() {
        Path path = configPath();
        boolean migrated = false;
        if (Files.exists(path)) {
            try (Reader reader = Files.newBufferedReader(path)) {
                INSTANCE = GSON.fromJson(reader, ClanCapesConfig.class);
            } catch (IOException e) {
                ClanCapesClient.LOGGER.warn("Failed to read config, using defaults", e);
                INSTANCE = new ClanCapesConfig();
                migrated = true;
            }
            if (INSTANCE == null) {
                INSTANCE = new ClanCapesConfig();
                migrated = true;
            } else if (INSTANCE.apiBaseUrl == null || INSTANCE.apiBaseUrl.isBlank()) {
                INSTANCE.apiBaseUrl = DEFAULT_API_BASE_URL;
                migrated = true;
            } else {
                for (String stale : STALE_DEFAULT_URLS) {
                    if (stale.equalsIgnoreCase(INSTANCE.apiBaseUrl.trim())) {
                        ClanCapesClient.LOGGER.info(
                                "Migrating stale apiBaseUrl '{}' to '{}'",
                                INSTANCE.apiBaseUrl, DEFAULT_API_BASE_URL);
                        INSTANCE.apiBaseUrl = DEFAULT_API_BASE_URL;
                        migrated = true;
                        break;
                    }
                }
            }
            if (migrated) {
                save();
            }
        } else {
            INSTANCE = new ClanCapesConfig();
            save();
        }
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
