package dev.crestoria.task;

import dev.crestoria.CrestoriaPlugin;
import org.bukkit.scheduler.BukkitRunnable;

/**
 * Periodic refresh of one repository. The plugin schedules separate
 * RefreshTask instances per repo with their own cadences so banners
 * (rarely changed) don't get hammered at the same rate as the clan
 * roster (changes on every join/kick).
 */
public final class RefreshTask extends BukkitRunnable {

    private final CrestoriaPlugin plugin;
    private final String name;
    private final Runnable refresh;

    public RefreshTask(CrestoriaPlugin plugin, String name, Runnable refresh) {
        this.plugin = plugin;
        this.name = name;
        this.refresh = refresh;
    }

    @Override
    public void run() {
        if (!plugin.getPanelClient().isConfigured()) return;
        if (plugin.getConfig().getBoolean("logging.debug", false)) {
            plugin.getLogger().info("[refresh] " + name);
        }
        refresh.run();
    }
}
