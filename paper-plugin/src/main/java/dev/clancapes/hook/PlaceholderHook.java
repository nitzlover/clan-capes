package dev.clancapes.hook;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.config.PluginConfig;
import dev.clancapes.service.CapeService;
import org.bukkit.Bukkit;

public final class PlaceholderHook {
    private final ClanCapesPlugin plugin;
    private final CapeService capeService;
    private final PluginConfig config;

    public PlaceholderHook(ClanCapesPlugin plugin, CapeService capeService) {
        this.plugin = plugin;
        this.capeService = capeService;
        this.config = plugin.getPluginConfig();
    }

    public void register() {
        if (!config.isPlaceholderApiEnabled() || Bukkit.getPluginManager().getPlugin("PlaceholderAPI") == null) {
            return;
        }
        new PlaceholderExpansionImpl(plugin, capeService).register();
        plugin.getLogger().info("PlaceholderAPI expansion registered");
    }
}
