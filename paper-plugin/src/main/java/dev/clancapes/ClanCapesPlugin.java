package dev.clancapes;

import dev.clancapes.api.PanelClient;
import dev.clancapes.command.ClanCapeCommand;
import dev.clancapes.command.ClanChatCommand;
import dev.clancapes.command.ClanCommand;
import dev.clancapes.events.EventScheduler;
import dev.clancapes.listener.BoundaryListener;
import dev.clancapes.listener.ClanArmorListener;
import dev.clancapes.listener.ClanMenuListener;
import dev.clancapes.listener.ClanShieldListener;
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
    private ClanArmorListener clanArmorListener;
    private ClanShieldListener clanShieldListener;
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
        clanArmorListener = new ClanArmorListener(this);
        Bukkit.getPluginManager().registerEvents(clanArmorListener, this);
        clanShieldListener = new ClanShieldListener(this);
        Bukkit.getPluginManager().registerEvents(clanShieldListener, this);

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
        // Bounce the event scheduler so its tick task and the surrounding
        // repo/client state are consistent for the next tick. Leaves any
        // in-flight event running — operator can /clancape event stop if
        // they want a clean slate.
        if (eventScheduler != null) {
            eventScheduler.stop();
            eventScheduler.start();
        }
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
            if (latest == null || latest.isEmpty()) return;
            // 1.0.11: semver-aware compare. Earlier releases used
            // !latest.equals(current), which also fired on a DOWNGRADE
            // — e.g. plugin running 1.0.10 with the panel temporarily
            // serving 1.0.9 (Railway redeploy lag) showed a spurious
            // "update available: v1.0.9" nag. The new comparison only
            // surfaces an update when the announced version is
            // strictly greater than the running one.
            if (compareSemver(latest, current) <= 0) return;
            updateAvailable = true;
            latestVersion = latest;
            updateUrl = json.has("downloadUrl") && !json.get("downloadUrl").isJsonNull()
                    ? json.get("downloadUrl").getAsString() : "";
            getLogger().warning("Update available: " + current + " -> " + latest
                    + (updateUrl.isEmpty() ? "" : " (" + updateUrl + ")"));
            tryAutoDownload(latest, updateUrl);
        }).exceptionally(t -> null);
    }

    /**
     * Compare two dot-separated semver-ish strings ("1.0.10" vs "1.0.9").
     * Returns a negative number when {@code a < b}, zero when equal,
     * positive when {@code a > b}. Non-numeric segments fall back to a
     * lexical compare so build tags ("1.0.0-rc1") don't crash the path.
     */
    private static int compareSemver(String a, String b) {
        if (a == null) a = "";
        if (b == null) b = "";
        String[] ap = a.split("\\.");
        String[] bp = b.split("\\.");
        int n = Math.max(ap.length, bp.length);
        for (int i = 0; i < n; i++) {
            String as = i < ap.length ? ap[i] : "0";
            String bs = i < bp.length ? bp[i] : "0";
            try {
                int ai = Integer.parseInt(as.replaceAll("[^0-9].*", ""));
                int bi = Integer.parseInt(bs.replaceAll("[^0-9].*", ""));
                if (ai != bi) return Integer.compare(ai, bi);
            } catch (NumberFormatException nfe) {
                int c = as.compareTo(bs);
                if (c != 0) return c;
            }
        }
        return 0;
    }

    /**
     * If the operator has opted into auto-download and the panel
     * advertised a download URL, fetch the new jar straight into
     * {@code plugins/update/}. Paper hot-swaps any jar found in that
     * directory at the next clean stop/start, so the operator just
     * has to restart — no manual SFTP, no jar hosting on the MC box.
     *
     * <p>Safety rails:
     * <ul>
     *   <li>Opt-in via {@code auto-update.enabled} in config.yml
     *       (default {@code true} but easy to disable for ops who
     *       prefer a fully manual workflow).</li>
     *   <li>Download URL must be present + look like a remote http(s)
     *       URL. Empty / null / file: URLs are ignored.</li>
     *   <li>Target filename includes the version so the existing jar
     *       is never overwritten in place — Paper deletes the old
     *       copy after a successful start.</li>
     *   <li>Errors are logged at WARNING and the regular nag still
     *       fires so the operator has a fallback manual path.</li>
     * </ul>
     */
    private void tryAutoDownload(String latest, String downloadUrl) {
        if (!getConfig().getBoolean("auto-update.enabled", true)) {
            getLogger().info("Auto-update disabled in config — operator must install "
                    + latest + " manually.");
            return;
        }
        if (downloadUrl == null || downloadUrl.isBlank()) {
            getLogger().info("Update available but PLUGIN_DOWNLOAD_URL is unset on the panel — "
                    + "operator must install " + latest + " manually.");
            return;
        }
        if (!(downloadUrl.startsWith("http://") || downloadUrl.startsWith("https://"))) {
            getLogger().warning("Refusing auto-download — unexpected URL scheme: " + downloadUrl);
            return;
        }
        java.nio.file.Path updateDir = getDataFolder().toPath()
                .getParent().resolve("update");
        java.nio.file.Path target = updateDir.resolve("ClanCapes-" + latest + ".jar");
        getServer().getScheduler().runTaskAsynchronously(this, () -> {
            try {
                java.nio.file.Files.createDirectories(updateDir);
                java.net.http.HttpClient http = java.net.http.HttpClient.newBuilder()
                        .connectTimeout(java.time.Duration.ofSeconds(10))
                        .build();
                java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder()
                        .uri(java.net.URI.create(downloadUrl))
                        .timeout(java.time.Duration.ofSeconds(60))
                        .header("Accept", "application/java-archive,*/*")
                        .header("User-Agent", "ClanCapes/" + getPluginMeta().getVersion())
                        .GET()
                        .build();
                java.net.http.HttpResponse<java.io.InputStream> res = http.send(req,
                        java.net.http.HttpResponse.BodyHandlers.ofInputStream());
                if (res.statusCode() < 200 || res.statusCode() >= 300) {
                    getLogger().warning("Auto-download failed: HTTP " + res.statusCode());
                    return;
                }
                try (var in = res.body()) {
                    java.nio.file.Files.copy(in, target,
                            java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                }
                long size = java.nio.file.Files.size(target);
                getLogger().warning("Auto-downloaded " + target.getFileName()
                        + " (" + size + " B). Restart server to apply.");
            } catch (Throwable t) {
                getLogger().warning("Auto-download error: " + t.getMessage());
                try { java.nio.file.Files.deleteIfExists(target); } catch (Throwable ignored) {}
            }
        });
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
    public ClanArmorListener getClanArmorListener() { return clanArmorListener; }
    public ClanShieldListener getClanShieldListener() { return clanShieldListener; }

    /**
     * Emit a debug-level log line only when {@code logging.debug} is on.
     * Takes a {@link java.util.function.Supplier} so callers pay the
     * string-formatting cost only when debug is actually enabled.
     */
    public void debugLog(java.util.function.Supplier<String> messageSupplier) {
        if (getConfig().getBoolean("logging.debug", false)) {
            getLogger().info(messageSupplier.get());
        }
    }
}
