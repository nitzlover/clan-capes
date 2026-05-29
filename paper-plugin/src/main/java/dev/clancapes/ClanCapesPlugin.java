package dev.clancapes;

import dev.clancapes.api.PanelClient;
import dev.clancapes.command.ClanCapeCommand;
import dev.clancapes.command.ClanChatCommand;
import dev.clancapes.command.ClanCommand;
import dev.clancapes.events.EventScheduler;
import dev.clancapes.listener.BoundaryListener;
import dev.clancapes.listener.ClanMenuListener;
import dev.clancapes.listener.FriendlyFireListener;
import dev.clancapes.listener.PlayerDeathListener;
import dev.clancapes.listener.PlayerJoinListener;
import dev.clancapes.placeholder.ClanCapesExpansion;
import dev.clancapes.repo.AnnouncementRepository;
import dev.clancapes.repo.ArmorTrimRepository;
import dev.clancapes.repo.BannerRepository;
import dev.clancapes.repo.ClanRepository;
import dev.clancapes.repo.EventConfigRepository;
import dev.clancapes.repo.SettingsRepository;
import dev.clancapes.task.HeartbeatTask;
import dev.clancapes.task.RefreshTask;
import org.bukkit.Bukkit;
import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.util.ArrayList;
import java.util.List;

public final class ClanCapesPlugin extends JavaPlugin {

    private PanelClient panelClient;
    private ClanRepository clanRepository;
    private ArmorTrimRepository armorTrimRepository;
    private BannerRepository bannerRepository;
    private SettingsRepository settingsRepository;
    private AnnouncementRepository announcementRepository;
    private EventConfigRepository eventConfigRepository;
    private EventScheduler eventScheduler;
    private ClanCapesExpansion expansion;
    private final List<BukkitTask> scheduled = new ArrayList<>();
    // Self-update nag state — populated by checkForUpdate(), surfaced to
    // admins on join. Never auto-downloads (Bukkit hot-swap is unsafe).
    private volatile boolean updateAvailable;
    private volatile String latestVersion = "";
    private volatile String updateUrl = "";

    @Override
    public void onEnable() {
        saveDefaultConfig();
        buildPanelClient();
        clanRepository = new ClanRepository(panelClient, getLogger());
        armorTrimRepository = new ArmorTrimRepository(panelClient, getLogger());
        bannerRepository = new BannerRepository(panelClient, getLogger());
        settingsRepository = new SettingsRepository(panelClient, getLogger());
        announcementRepository = new AnnouncementRepository(panelClient, getLogger());
        eventConfigRepository = new EventConfigRepository(panelClient, getLogger());

        registerCommands();
        Bukkit.getPluginManager().registerEvents(new PlayerJoinListener(this), this);
        Bukkit.getPluginManager().registerEvents(new PlayerDeathListener(this), this);
        Bukkit.getPluginManager().registerEvents(new FriendlyFireListener(this), this);
        Bukkit.getPluginManager().registerEvents(new BoundaryListener(), this);
        Bukkit.getPluginManager().registerEvents(new ClanMenuListener(), this);

        if (Bukkit.getPluginManager().getPlugin("PlaceholderAPI") != null) {
            expansion = new ClanCapesExpansion(this);
            expansion.register();
            getLogger().info("PlaceholderAPI expansion registered.");
        } else {
            getLogger().info("PlaceholderAPI not present — placeholders disabled.");
        }

        startScheduledTasks();

        if (!panelClient.isConfigured()) {
            getLogger().warning("Panel not linked. Run /clancape setup to register.");
        } else {
            // Warm caches once on enable so /clan info works immediately.
            clanRepository.refresh();
            armorTrimRepository.refresh();
            bannerRepository.refresh();
            settingsRepository.refresh();
            announcementRepository.refresh();
            eventConfigRepository.refresh();
            checkForUpdate();
        }

        // Boot the scheduler — its own tick gates on EventConfigRepository
        // being non-empty, so a pre-linked deploy is harmless (no-op tick).
        eventScheduler = new EventScheduler(this);
        eventScheduler.start();
    }

    @Override
    public void onDisable() {
        if (eventScheduler != null) {
            eventScheduler.stop();
            eventScheduler = null;
        }
        cancelScheduled();
        if (expansion != null) {
            try {
                expansion.unregister();
            } catch (Throwable ignore) {
            }
            expansion = null;
        }
    }

    private void registerCommands() {
        PluginCommand clancape = getCommand("clancape");
        if (clancape != null) clancape.setExecutor(new ClanCapeCommand(this));
        PluginCommand clans = getCommand("clans");
        if (clans != null) clans.setExecutor(new ClanCommand(this));
        PluginCommand clanc = getCommand("clanc");
        if (clanc != null) clanc.setExecutor(new ClanChatCommand(this));
    }

    private void buildPanelClient() {
        String url = getConfig().getString("panel.url", "").trim();
        String apiKey = getConfig().getString("panel.api-key", "").trim();
        int timeoutMs = getConfig().getInt("panel.request-timeout-ms", 5000);
        boolean debug = getConfig().getBoolean("logging.debug", false);
        panelClient = new PanelClient(url, apiKey, timeoutMs, getLogger(), debug);
    }

    private void startScheduledTasks() {
        cancelScheduled();
        long ticksPerSec = 20L;
        int clansSec = getConfig().getInt("panel.refresh-clans-sec", 300);
        int bannersSec = getConfig().getInt("panel.refresh-banners-sec", 300);
        int trimsSec = getConfig().getInt("panel.refresh-trims-sec", 300);
        int settingsSec = getConfig().getInt("panel.refresh-settings-sec", 600);
        int announcementsSec = getConfig().getInt("panel.refresh-announcements-sec", 300);
        int eventConfigSec = getConfig().getInt("panel.refresh-event-config-sec", 300);
        int heartbeatSec = getConfig().getInt("panel.heartbeat-sec", 30);

        scheduled.add(new RefreshTask(this, "clans", () -> clanRepository.refresh())
                .runTaskTimerAsynchronously(this, ticksPerSec * clansSec, ticksPerSec * clansSec));
        scheduled.add(new RefreshTask(this, "banners", () -> bannerRepository.refresh())
                .runTaskTimerAsynchronously(this, ticksPerSec * bannersSec, ticksPerSec * bannersSec));
        scheduled.add(new RefreshTask(this, "trims", () -> armorTrimRepository.refresh())
                .runTaskTimerAsynchronously(this, ticksPerSec * trimsSec, ticksPerSec * trimsSec));
        scheduled.add(new RefreshTask(this, "settings", () -> settingsRepository.refresh())
                .runTaskTimerAsynchronously(this, ticksPerSec * settingsSec, ticksPerSec * settingsSec));
        scheduled.add(new RefreshTask(this, "announcements", () -> announcementRepository.refresh())
                .runTaskTimerAsynchronously(this, ticksPerSec * announcementsSec, ticksPerSec * announcementsSec));
        scheduled.add(new RefreshTask(this, "event-config", () -> eventConfigRepository.refresh())
                .runTaskTimerAsynchronously(this, ticksPerSec * eventConfigSec, ticksPerSec * eventConfigSec));
        scheduled.add(new HeartbeatTask(this)
                .runTaskTimerAsynchronously(this, ticksPerSec * heartbeatSec, ticksPerSec * heartbeatSec));
    }

    private void cancelScheduled() {
        for (BukkitTask t : scheduled) {
            try { t.cancel(); } catch (Throwable ignore) {}
        }
        scheduled.clear();
    }

    /**
     * Called by /clancape link and /clancape reload — rebuilds the panel
     * client with fresh credentials and re-arms the scheduled refresh
     * tasks so the next tick already uses the new key.
     */
    public void reloadFromConfig() {
        buildPanelClient();
        // Replace the client reference seen by the repos.
        clanRepository = new ClanRepository(panelClient, getLogger());
        armorTrimRepository = new ArmorTrimRepository(panelClient, getLogger());
        bannerRepository = new BannerRepository(panelClient, getLogger());
        settingsRepository = new SettingsRepository(panelClient, getLogger());
        announcementRepository = new AnnouncementRepository(panelClient, getLogger());
        eventConfigRepository = new EventConfigRepository(panelClient, getLogger());
        startScheduledTasks();
        if (panelClient.isConfigured()) {
            clanRepository.refresh();
            armorTrimRepository.refresh();
            bannerRepository.refresh();
            settingsRepository.refresh();
            announcementRepository.refresh();
            eventConfigRepository.refresh();
        }
    }

    /**
     * One-shot async version check against the panel. Sets the
     * update-nag flags + logs a WARNING when the panel advertises a
     * version different from the running one. Never downloads — a
     * Bukkit hot-swap is unsafe, so the operator pulls the jar
     * manually (the URL is in the warning + the admin join nag).
     */
    private void checkForUpdate() {
        String current = getPluginMeta().getVersion();
        panelClient.getPluginVersion().thenAccept(json -> {
            if (json == null || !json.has("latest")) return;
            String latest = json.get("latest").getAsString();
            if (latest == null || latest.isEmpty() || latest.equals(current)) return;
            updateAvailable = true;
            latestVersion = latest;
            updateUrl = json.has("downloadUrl") && !json.get("downloadUrl").isJsonNull()
                    ? json.get("downloadUrl").getAsString() : "";
            getLogger().warning("Update available: " + current + " -> " + latest
                    + (updateUrl.isEmpty() ? "" : " (" + updateUrl + ")")
                    + ". Manual install — never hot-swap a live jar.");
        }).exceptionally(t -> null);
    }

    public boolean isUpdateAvailable() { return updateAvailable; }
    public String getLatestVersion() { return latestVersion; }
    public String getUpdateUrl() { return updateUrl; }

    public PanelClient getPanelClient() { return panelClient; }
    public ClanRepository getClanRepository() { return clanRepository; }
    public ArmorTrimRepository getArmorTrimRepository() { return armorTrimRepository; }
    public BannerRepository getBannerRepository() { return bannerRepository; }
    public SettingsRepository getSettingsRepository() { return settingsRepository; }
    public AnnouncementRepository getAnnouncementRepository() { return announcementRepository; }
    public EventConfigRepository getEventConfigRepository() { return eventConfigRepository; }
    public EventScheduler getEventScheduler() { return eventScheduler; }
}
