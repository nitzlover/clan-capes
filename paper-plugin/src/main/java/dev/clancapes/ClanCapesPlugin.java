package dev.clancapes;

import dev.clancapes.api.RestApiServer;
import dev.clancapes.command.ClanCapeCommand;
import dev.clancapes.config.PluginConfig;
import dev.clancapes.hook.PowerClansHook;
import dev.clancapes.hook.PlaceholderHook;
import dev.clancapes.service.CapeService;
import dev.clancapes.sync.CapeSyncChannel;
import dev.clancapes.storage.StorageFactory;
import dev.clancapes.storage.CapeStorage;
import org.bukkit.plugin.java.JavaPlugin;

public final class ClanCapesPlugin extends JavaPlugin {
    private static ClanCapesPlugin instance;

    private PluginConfig pluginConfig;
    private CapeStorage storage;
    private CapeService capeService;
    private RestApiServer apiServer;
    private CapeSyncChannel syncChannel;
    private PowerClansHook powerClansHook;
    private PlaceholderHook placeholderHook;

    @Override
    public void onEnable() {
        instance = this;
        saveDefaultConfig();
        pluginConfig = new PluginConfig(getConfig());

        storage = StorageFactory.create(this, pluginConfig);
        storage.init();

        powerClansHook = new PowerClansHook(this);
        powerClansHook.register();

        syncChannel = new CapeSyncChannel(this);
        syncChannel.register();

        capeService = new CapeService(this, storage, pluginConfig, syncChannel, powerClansHook);

        placeholderHook = new PlaceholderHook(this, capeService);
        placeholderHook.register();

        var command = new ClanCapeCommand(this, capeService, powerClansHook);
        getCommand("clan").setExecutor(command);
        getCommand("clan").setTabCompleter(command);

        if (pluginConfig.isApiEnabled()) {
            apiServer = new RestApiServer(this, capeService, pluginConfig, powerClansHook);
            apiServer.start();
        }

        getLogger().info("ClanCapes enabled (storage=" + pluginConfig.getStorageType()
                + ", api=" + pluginConfig.isApiEnabled() + ")");
    }

    @Override
    public void onDisable() {
        if (apiServer != null) {
            apiServer.stop();
        }
        if (storage != null) {
            storage.close();
        }
        instance = null;
    }

    public static ClanCapesPlugin getInstance() {
        return instance;
    }

    public PluginConfig getPluginConfig() {
        return pluginConfig;
    }

    public CapeService getCapeService() {
        return capeService;
    }

    public PowerClansHook getPowerClansHook() {
        return powerClansHook;
    }
}
