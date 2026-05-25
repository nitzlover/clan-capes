package dev.clancapes;

import dev.clancapes.api.RestApiServer;
import dev.clancapes.clan.BannerRepository;
import dev.clancapes.clan.ClanRepository;
import dev.clancapes.clan.ClanTeamManager;
import dev.clancapes.clan.PendingInvites;
import dev.clancapes.clan.SettingsCache;
import dev.clancapes.clan.StatsCache;
import dev.clancapes.command.ClanCapeCommand;
import dev.clancapes.command.ClanCommand;
import dev.clancapes.config.PluginConfig;
import dev.clancapes.hook.PowerClansHook;
import dev.clancapes.hook.PlaceholderHook;
import dev.clancapes.listener.PvpKillListener;
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
    private BannerRepository bannerRepository;
    private ClanTeamManager clanTeamManager;
    private PendingInvites pendingInvites;
    private StatsCache statsCache;
    private SettingsCache settingsCache;
    private BukkitTask clanRefreshTask;
    private BukkitTask bannerRefreshTask;
    private BukkitTask settingsRefreshTask;

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

        // Phase 5 — PvP kill ingest. Stats cache is created up front so
        // the placeholder hook can read from it on the first render.
        statsCache = new StatsCache(this);
        getServer().getPluginManager().registerEvents(
                new PvpKillListener(this), this);

        // Phase 6 — live operator settings (palette / cooldowns / max
        // layers). Initial refresh fires immediately; periodic poll
        // matches the 5-min cadence used by clan + banner caches.
        settingsCache = new SettingsCache(this);
        settingsCache.refreshAsync(null);
        settingsRefreshTask = getServer().getScheduler().runTaskTimerAsynchronously(
                this,
                () -> settingsCache.refreshAsync(null),
                20L * 60 * 5,
                20L * 60 * 5);

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

        // Bootstrap the clan repository + team manager. Repository pulls
        // the full clan list off the panel; team manager mirrors that
        // into vanilla scoreboard teams (one per clan) so nametag +
        // TAB prefixes paint themselves without packet magic. Both
        // no-op while the panel block is empty.
        clanRepository = new ClanRepository(this);
        bannerRepository = new BannerRepository(this);
        clanTeamManager = new ClanTeamManager(this);
        pendingInvites = new PendingInvites();

        Runnable syncTeamsOnMain = () ->
                getServer().getScheduler().runTask(this, () -> clanTeamManager.sync());
        clanRepository.refreshAsync(syncTeamsOnMain);
        clanRefreshTask = getServer().getScheduler().runTaskTimerAsynchronously(
                this,
                () -> clanRepository.refreshAsync(syncTeamsOnMain),
                20L * 60 * 5,  // first periodic refresh: +5 min after enable
                20L * 60 * 5); // every 5 min thereafter

        // Banner cache — same cadence so Phase-3 auto-paint sees panel
        // edits within five minutes even without the explicit ping from
        // the panel's BannerSync endpoint (which can lose packets across
        // a flaky network).
        bannerRepository.refreshAsync(null);
        bannerRefreshTask = getServer().getScheduler().runTaskTimerAsynchronously(
                this,
                () -> bannerRepository.refreshAsync(null),
                20L * 60 * 5,
                20L * 60 * 5);

        // /clans command — uses `clans` as primary name to coexist
        // with PowerClans's /clan during the migration window. Once
        // PowerClans is removed, the `clan` alias in plugin.yml takes
        // over automatically.
        var clanCmd = new ClanCommand(this, pendingInvites);
        var clansBukkit = getCommand("clans");
        if (clansBukkit != null) {
            clansBukkit.setExecutor(clanCmd);
            clansBukkit.setTabCompleter(clanCmd);
        } else {
            getLogger().warning("Command 'clans' missing from plugin.yml; /clans disabled");
        }

        // /clanc — clan-only chat broadcast.
        var clancBukkit = getCommand("clanc");
        if (clancBukkit != null) {
            clancBukkit.setExecutor(new dev.clancapes.command.ClanChatCommand(this));
        } else {
            getLogger().warning("Command 'clanc' missing from plugin.yml; /clanc disabled");
        }

        getLogger().info("ClanCapes enabled (storage=" + pluginConfig.getStorageType()
                + ", api=" + pluginConfig.isApiEnabled() + ")");
    }

    @Override
    public void onDisable() {
        if (clanRefreshTask != null) {
            clanRefreshTask.cancel();
            clanRefreshTask = null;
        }
        if (bannerRefreshTask != null) {
            bannerRefreshTask.cancel();
            bannerRefreshTask = null;
        }
        if (settingsRefreshTask != null) {
            settingsRefreshTask.cancel();
            settingsRefreshTask = null;
        }
        if (clanTeamManager != null) {
            try {
                clanTeamManager.shutdown();
            } catch (Exception ignored) {
                // Scoreboard may already be torn down on shutdown.
            }
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
     * Panel-backed banner cache. Feeds {@link BannerService#applyToHeldShields}
     * so Phase-3 auto-paint reads the same DB the admin UI writes to,
     * instead of the legacy local SQLite store. May be null on a
     * pre-Phase-3 deploy — callers should guard accordingly.
     */
    public BannerRepository getBannerRepository() {
        return bannerRepository;
    }

    /**
     * Per-player stats cache feeding the K/D placeholders. Refreshed
     * lazily on miss + invalidated by the PvP listener after every
     * kill so subsequent placeholder reads pick up the new totals
     * without waiting for the cache TTL.
     */
    public StatsCache getStatsCache() {
        return statsCache;
    }

    /**
     * Operator-set settings (palette / cooldowns / max layers).
     * Refreshed every 5 min from {@code /api/plugin/settings}.
     */
    public SettingsCache getSettingsCache() {
        return settingsCache;
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
