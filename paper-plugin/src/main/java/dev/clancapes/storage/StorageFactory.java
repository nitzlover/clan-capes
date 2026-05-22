package dev.clancapes.storage;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.config.PluginConfig;

public final class StorageFactory {
    private StorageFactory() {
    }

    public static CapeStorage create(ClanCapesPlugin plugin, PluginConfig config) {
        return switch (config.getStorageType().toLowerCase()) {
            case "json" -> new JsonCapeStorage(plugin, config.getJsonFile());
            default -> new SqliteCapeStorage(plugin, config.getSqliteFile());
        };
    }
}
