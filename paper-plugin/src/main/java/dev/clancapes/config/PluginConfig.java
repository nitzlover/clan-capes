package dev.clancapes.config;

import org.bukkit.configuration.file.FileConfiguration;

import java.util.List;

public final class PluginConfig {
    private final FileConfiguration config;

    public PluginConfig(FileConfiguration config) {
        this.config = config;
    }

    public String getStorageType() {
        return config.getString("storage.type", "sqlite");
    }

    public String getSqliteFile() {
        return config.getString("storage.sqlite-file", "plugins/ClanCapes/data.db");
    }

    public String getJsonFile() {
        return config.getString("storage.json-file", "plugins/ClanCapes/capes.json");
    }

    public boolean isApiEnabled() {
        return config.getBoolean("api.enabled", true);
    }

    public String getApiHost() {
        return config.getString("api.host", "0.0.0.0");
    }

    public int getApiPort() {
        return config.getInt("api.port", 8080);
    }

    public String getApiToken() {
        return config.getString("api.token", "change-me");
    }

    public String getCdnBaseUrl() {
        return config.getString("api.cdn-base-url", "http://127.0.0.1:3001/static/capes");
    }

    public List<String> getCorsOrigins() {
        return config.getStringList("api.cors-origins");
    }

    public String getCapesStorageDir() {
        return config.getString("capes.storage-dir", "plugins/ClanCapes/capes");
    }

    public int getMaxFileSizeKb() {
        return config.getInt("capes.max-file-size-kb", 256);
    }

    public boolean isPowerClansEnabled() {
        return config.getBoolean("integrations.powerclans", true);
    }

    /** Optional override, e.g. plugins/PowerClans/data.yml */
    public String getPowerClansDataFile() {
        return config.getString("integrations.powerclans-data-file", "");
    }

    public boolean isPlaceholderApiEnabled() {
        return config.getBoolean("integrations.placeholderapi", true);
    }

    public boolean isWebhookEnabled() {
        return config.getBoolean("webhook.enabled", false);
    }

    public String getWebhookUrl() {
        return config.getString("webhook.url", "");
    }

    public String getWebhookSecret() {
        return config.getString("webhook.secret", "");
    }

    public boolean isDebugLogging() {
        return config.getBoolean("logging.debug", false);
    }

    public String prefix() {
        return colorize(config.getString("messages.prefix", ""));
    }

    public String msg(String key) {
        if ("prefix".equals(key)) {
            return prefix();
        }
        return colorize(config.getString("messages.prefix", "") + config.getString("messages." + key, ""));
    }

    private static String colorize(String input) {
        return input == null ? "" : input.replace('&', '\u00A7');
    }
}
