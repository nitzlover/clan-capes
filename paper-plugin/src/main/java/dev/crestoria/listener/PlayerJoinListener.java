package dev.crestoria.listener;

import dev.crestoria.CrestoriaPlugin;
import dev.crestoria.api.dto.InvitationDto;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

import java.util.List;
import java.util.UUID;

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

    private final CrestoriaPlugin plugin;

    public PlayerJoinListener(CrestoriaPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onJoin(PlayerJoinEvent event) {
        if (plugin.getClanRepository().all().isEmpty()
                && plugin.getPanelClient().isConfigured()) {
            plugin.getClanRepository().refresh();
        }

        // Re-evaluate the trims on whatever armour the player is already
        // wearing. PlayerArmorChangeEvent fires for every subsequent swap,
        // but doesn't fire for the initial join — without this, a player
        // who was wearing trimmed armour at logout would render bare
        // until they swapped a piece.
        if (plugin.getClanArmorListener() != null) {
            plugin.getClanArmorListener().scheduleJoinReconcile(event.getPlayer());
        }
        if (plugin.getClanShieldListener() != null) {
            // Two ticks after join: clan cache is warm and the player's
            // inventory has settled, so the same delay as the armour
            // reconcile is the cheapest correct moment to brand any
            // shield the player was already holding at logout.
            Bukkit.getScheduler().runTaskLater(plugin,
                    () -> plugin.getClanShieldListener().reconcileHands(event.getPlayer()),
                    2L);
        }

        if (plugin.isUpdateAvailable()
                && event.getPlayer().hasPermission("clancapes.admin")) {
            var p = event.getPlayer();
            p.sendMessage(Component.text(
                    "Crestoria update available: v" + plugin.getLatestVersion(),
                    NamedTextColor.GOLD));
            String url = plugin.getUpdateUrl();
            if (!url.isEmpty()) {
                p.sendMessage(Component.text("  " + url, NamedTextColor.GRAY)
                        .clickEvent(ClickEvent.openUrl(url))
                        .hoverEvent(HoverEvent.showText(Component.text(
                                "Click to open download page",
                                NamedTextColor.GRAY))));
            }
            // 1.0.11: if the plugin has already auto-downloaded the
            // new jar to plugins/update/, surface that instead of the
            // old "manual install only" line.
            boolean autoStaged = plugin.getServer().getUpdateFolderFile().toPath()
                    .resolve("Crestoria-" + plugin.getLatestVersion() + ".jar")
                    .toFile().isFile();
            if (autoStaged) {
                p.sendMessage(Component.text(
                        "  Auto-download ready — restart server to apply.",
                        NamedTextColor.GREEN));
            } else {
                p.sendMessage(Component.text(
                        "  Manual install only — do not hot-swap a live jar.",
                        NamedTextColor.GRAY));
            }
        }

        // Pending-invite nag — surface the invitee's open invitations
        // with clickable accept/decline hints. Skip if the player is
        // already in a clan (the panel would 409 anyway).
        if (!plugin.getPanelClient().isConfigured()) return;
        Player joining = event.getPlayer();
        UUID uuid = joining.getUniqueId();
        if (plugin.getClanRepository().getByPlayer(uuid).isPresent()) return;
        plugin.getPanelClient().listPlayerInvites(uuid)
                .whenComplete((invites, err) -> Bukkit.getScheduler().runTask(plugin, () -> {
                    if (err != null || invites == null || invites.isEmpty()) return;
                    if (!joining.isOnline()) return;
                    joining.sendMessage(Component.text(
                            "You have " + invites.size() + " pending clan invitation"
                                    + (invites.size() == 1 ? "" : "s") + ":",
                            NamedTextColor.GOLD));
                    for (InvitationDto i : invites) {
                        renderInvite(joining, i);
                    }
                    joining.sendMessage(Component.text(
                            "  Use /clan accept <TAG> or /clan decline <TAG>.",
                            NamedTextColor.GRAY));
                }));
    }

    /** Per-invitation line with clickable accept / decline. */
    private static void renderInvite(Player p, InvitationDto i) {
        Component accept = Component.text("[Accept]", NamedTextColor.GREEN)
                .clickEvent(ClickEvent.runCommand("/clan accept " + i.clanTag))
                .hoverEvent(HoverEvent.showText(Component.text(
                        "Click to join [" + i.clanTag + "]", NamedTextColor.GRAY)));
        Component decline = Component.text("[Decline]", NamedTextColor.RED)
                .clickEvent(ClickEvent.runCommand("/clan decline " + i.clanTag))
                .hoverEvent(HoverEvent.showText(Component.text(
                        "Click to reject", NamedTextColor.GRAY)));
        p.sendMessage(Component.text(
                "  [" + i.clanTag + "] " + i.clanName + "  ", NamedTextColor.GRAY)
                .append(accept).append(Component.text(" ", NamedTextColor.GRAY)).append(decline));
    }
}
