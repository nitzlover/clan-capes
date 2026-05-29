package dev.clancapes.listener;

import dev.clancapes.ClanCapesPlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

/**
 * Triggers cache warm-up if the plugin has been linked but the
 * snapshot is empty (e.g. first join after server restart). Avoids
 * the "player joins, /clan info returns nothing because we haven't
 * polled yet" footgun.
 *
 * <p>Also nags an admin (clancapes.admin) once on join when the panel
 * has advertised a newer plugin version — the manual-update channel
 * from the Wave 3 self-update item (no auto hot-swap).
 */
public final class PlayerJoinListener implements Listener {

    private final ClanCapesPlugin plugin;

    public PlayerJoinListener(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onJoin(PlayerJoinEvent event) {
        if (plugin.getClanRepository().all().isEmpty()
                && plugin.getPanelClient().isConfigured()) {
            plugin.getClanRepository().refresh();
        }

        if (plugin.isUpdateAvailable()
                && event.getPlayer().hasPermission("clancapes.admin")) {
            var p = event.getPlayer();
            p.sendMessage(Component.text(
                    "ClanCapes update available: v" + plugin.getLatestVersion(),
                    NamedTextColor.GOLD));
            String url = plugin.getUpdateUrl();
            if (!url.isEmpty()) {
                p.sendMessage(Component.text("  " + url, NamedTextColor.GRAY)
                        .clickEvent(ClickEvent.openUrl(url))
                        .hoverEvent(HoverEvent.showText(Component.text(
                                "Click to open download page",
                                NamedTextColor.GRAY))));
            }
            p.sendMessage(Component.text(
                    "  Manual install only — do not hot-swap a live jar.",
                    NamedTextColor.GRAY));
        }
    }
}
