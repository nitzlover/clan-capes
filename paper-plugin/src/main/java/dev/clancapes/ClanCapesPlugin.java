package dev.clancapes;

import dev.clancapes.api.RestApiServer;
import dev.clancapes.clan.ClanRepository;
import dev.clancapes.command.ClanCapeCommand;
import dev.clancapes.config.PluginConfig;
import dev.clancapes.hook.PowerClansHook;
import dev.clancapes.hook.PlaceholderHook;
import dev.clancapes.listener.ShieldBannerListener;
import dev.clancapes.panel.HeartbeatTask;
import dev.clancapes.service.BannerService;
import dev.clancapes.service.CapeService;
import dev.clancapes.sync.CapeSyncChannel;
import dev.clancapes.storage.StorageFactory;
import dev.clancapes.storage.CapeStorage;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

public final class ClanCapesPlugin extends JavaPlugin {
    private static ClanCapesPlugin instance;

    private PluginConfig pluginConfig;
    private CapeStorage storage;
    private CapeService capeService;
    private BannerService bannerService;
    private RestApiServer apiServer;
    private CapeSyncChannel syncChannel;
    private PowerClansHook powerClansHook;
    private PlaceholderHook placeholderHook;
    private HeartbeatTask heartbeatTask;
    private ClanRepository clanRepository;
    private BukkitTask clanRefreshTask;

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
        bannerService = new BannerService(this, storage, powerClansHook);

        placeholderHook = new PlaceholderHook(this, capeService);
        placeholderHook.register();

        getServer().getPluginManager().registerEvents(
                new ShieldBannerListener(this, bannerService), this);

        var command = new ClanCapeCommand(this, capeService, powerClansHook);
        var pluginCommand = getCommand("clancape");
        if (pluginCommand == null) {
            getLogger().severe("Command 'clancape' missing from plugin.yml — disabling plugin");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }
        pluginCommand.setExecutor(command);
        pluginCommand.setTabCompleter(command);

        if (pluginConfig.isApiEnabled()) {
            apiServer = new RestApiServer(this, capeService, bannerService, pluginConfig, powerClansHook);
            apiServer.start();
        }

        // Start the panel heartbeat task. The task itself no-ops while
        // panel.url or panel.api-key is empty, so servers that haven't
        // run /clancape setup yet stay silent.
        heartbeatTask = new HeartbeatTask(this);
        heartbeatTask.start();

        // Bootstrap the clan repository — initial async pull off the
        // panel, then a quiet 5-minute schedule to keep the in-memory
        // cache in sync. Both no-op when the panel block isn't
        // configured; the repository simply stays empty until the
        // operator runs /clancape setup + link.
        clanRepository = new ClanRepository(this);
        clanRepository.refreshAsync(null);
        clanRefreshTask = getServer().getScheduler().runTaskTimerAsynchronously(
                this,
                () -> clanRepository.refreshAsync(null),
                20L * 60 * 5,  // first periodic refresh: +5 min after enable
                20L * 60 * 5); // every 5 min thereafter

        getLogger().info("ClanCapes enabled (storage=" + pluginConfig.getStorageType()
                + ", api=" + pluginConfig.isApiEnabled() + ")");
    }

    @Override
    public void onDisable() {
        if (clanRefreshTask != null) {
            clanRefreshTask.cancel();
            clanRefreshTask = null;
        }
        if (heartbeatTask != null) {
            heartbeatTask.stop();
        }
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

    public BannerService getBannerService() {
        return bannerService;
    }

    public PowerClansHook getPowerClansHook() {
        return powerClansHook;
    }

    /**
     * DB-backed clan source of truth. Populated asynchronously from
     * {@code /api/plugin/clans} after enable; may be empty for the
     * first few hundred milliseconds. Coexists with PowerClansHook
     * during Phase 2.1–2.4 and replaces it entirely in Phase 2.5.
     */
    public ClanRepository getClanRepository() {
        return clanRepository;
    }

    /**
     * Soft reload — re-read config.yml off disk, swap the in-memory
     * PluginConfig wrapper so callers that hold {@code getPluginConfig()}
     * (HeartbeatTask, RestApiServer, etc.) start seeing the fresh
     * values on their next tick. Does NOT disable/enable the plugin,
     * which avoids the Paper-classloader + shaded-Jetty crash that
     * {@code /plugman reload ClanCapes} triggers on shutdown.
     *
     * Use this whenever config.yml changed and the operator wants the
     * plugin to pick up the change without restarting the whole
     * server.
     */
    public void refreshPluginConfig() {
        reloadConfig();
        pluginConfig = new PluginConfig(getConfig());
    }
}
