package dev.clancapes.storage;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.model.ClanBannerRecord;
import dev.clancapes.model.ClanCapeRecord;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public final class JsonCapeStorage implements CapeStorage {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final Type CAPE_MAP_TYPE = new TypeToken<Map<String, ClanCapeRecord>>() {}.getType();
    private static final Type BANNER_MAP_TYPE = new TypeToken<Map<String, ClanBannerRecord>>() {}.getType();

    private final ClanCapesPlugin plugin;
    private final File capesFile;
    private final File bannersFile;
    private final Map<String, ClanCapeRecord> capes = new LinkedHashMap<>();
    private final Map<String, ClanBannerRecord> banners = new LinkedHashMap<>();

    public JsonCapeStorage(ClanCapesPlugin plugin, String path) {
        this.plugin = plugin;
        this.capesFile = new File(path);
        // Banner file lives next to the cape file, with a fixed suffix so it
        // shows up clearly in the storage directory.
        this.bannersFile = new File(capesFile.getParentFile(), "clan_banners.json");
    }

    @Override
    public void init() {
        capesFile.getParentFile().mkdirs();
        loadCapes();
        loadBanners();
    }

    @Override
    public void close() {
        persistCapes();
        persistBanners();
    }

    private void loadCapes() {
        if (!capesFile.exists()) {
            persistCapes();
            return;
        }
        try (FileReader reader = new FileReader(capesFile)) {
            Map<String, ClanCapeRecord> loaded = GSON.fromJson(reader, CAPE_MAP_TYPE);
            if (loaded != null) {
                capes.clear();
                capes.putAll(loaded);
            }
        } catch (Exception e) {
            plugin.getLogger().warning("Failed to load capes JSON: " + e.getMessage());
        }
    }

    private void loadBanners() {
        if (!bannersFile.exists()) {
            persistBanners();
            return;
        }
        try (FileReader reader = new FileReader(bannersFile)) {
            Map<String, ClanBannerRecord> loaded = GSON.fromJson(reader, BANNER_MAP_TYPE);
            if (loaded != null) {
                banners.clear();
                banners.putAll(loaded);
            }
        } catch (Exception e) {
            plugin.getLogger().warning("Failed to load banners JSON: " + e.getMessage());
        }
    }

    private synchronized void persistCapes() {
        try (FileWriter writer = new FileWriter(capesFile)) {
            GSON.toJson(capes, writer);
        } catch (Exception e) {
            plugin.getLogger().warning("Failed to save capes JSON: " + e.getMessage());
        }
    }

    private synchronized void persistBanners() {
        try (FileWriter writer = new FileWriter(bannersFile)) {
            GSON.toJson(banners, writer);
        } catch (Exception e) {
            plugin.getLogger().warning("Failed to save banners JSON: " + e.getMessage());
        }
    }

    // ----- Capes --------------------------------------------------------------

    @Override
    public Optional<ClanCapeRecord> findByClan(String clanTag) {
        return Optional.ofNullable(capes.get(clanTag.toUpperCase()));
    }

    @Override
    public List<ClanCapeRecord> findAll() {
        return new ArrayList<>(capes.values());
    }

    @Override
    public void upsert(ClanCapeRecord record) {
        capes.put(record.clanTag().toUpperCase(), record);
        persistCapes();
    }

    @Override
    public void delete(String clanTag) {
        capes.remove(clanTag.toUpperCase());
        persistCapes();
    }

    @Override
    public void appendAudit(String clanTag, String action, String actor, String details) {
        plugin.getLogger().info("[AUDIT] " + clanTag + " " + action + " by " + actor + " — " + details);
    }

    // ----- Banners ------------------------------------------------------------

    @Override
    public Optional<ClanBannerRecord> findBannerByClan(String clanTag) {
        return Optional.ofNullable(banners.get(clanTag.toUpperCase()));
    }

    @Override
    public List<ClanBannerRecord> findAllBanners() {
        return new ArrayList<>(banners.values());
    }

    @Override
    public void upsertBanner(ClanBannerRecord record) {
        banners.put(record.clanTag().toUpperCase(), record);
        persistBanners();
    }

    @Override
    public void deleteBanner(String clanTag) {
        banners.remove(clanTag.toUpperCase());
        persistBanners();
    }
}
