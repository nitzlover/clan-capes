package dev.clancapes.storage;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import dev.clancapes.ClanCapesPlugin;
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
    private static final Type MAP_TYPE = new TypeToken<Map<String, ClanCapeRecord>>() {}.getType();

    private final ClanCapesPlugin plugin;
    private final File file;
    private final Map<String, ClanCapeRecord> cache = new LinkedHashMap<>();

    public JsonCapeStorage(ClanCapesPlugin plugin, String path) {
        this.plugin = plugin;
        this.file = new File(path);
    }

    @Override
    public void init() {
        file.getParentFile().mkdirs();
        if (!file.exists()) {
            persist();
            return;
        }
        try (FileReader reader = new FileReader(file)) {
            Map<String, ClanCapeRecord> loaded = GSON.fromJson(reader, MAP_TYPE);
            if (loaded != null) {
                cache.clear();
                cache.putAll(loaded);
            }
        } catch (Exception e) {
            plugin.getLogger().warning("Failed to load JSON storage: " + e.getMessage());
        }
    }

    @Override
    public void close() {
        persist();
    }

    private synchronized void persist() {
        try (FileWriter writer = new FileWriter(file)) {
            GSON.toJson(cache, writer);
        } catch (Exception e) {
            plugin.getLogger().warning("Failed to save JSON storage: " + e.getMessage());
        }
    }

    @Override
    public Optional<ClanCapeRecord> findByClan(String clanTag) {
        return Optional.ofNullable(cache.get(clanTag.toUpperCase()));
    }

    @Override
    public List<ClanCapeRecord> findAll() {
        return new ArrayList<>(cache.values());
    }

    @Override
    public void upsert(ClanCapeRecord record) {
        cache.put(record.clanTag().toUpperCase(), record);
        persist();
    }

    @Override
    public void delete(String clanTag) {
        cache.remove(clanTag.toUpperCase());
        persist();
    }

    @Override
    public void appendAudit(String clanTag, String action, String actor, String details) {
        plugin.getLogger().info("[AUDIT] " + clanTag + " " + action + " by " + actor + " — " + details);
    }
}
