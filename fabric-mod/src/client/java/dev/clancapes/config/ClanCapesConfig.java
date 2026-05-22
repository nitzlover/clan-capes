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

    public String apiBaseUrl = "http://127.0.0.1:8080";
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
