package dev.crestoria.listener;

import dev.crestoria.CrestoriaPlugin;
import dev.crestoria.api.dto.InvitationDto;
import dev.crestoria.util.Msg;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.format.TextDecoration;
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
            // Two ticks after join: clan cache is warm and the inventory
            // has settled, so this is the cheapest correct moment to claim
            // any blank clan shield the player was already holding at
            // logout (any hand). Tagged shields stay locked — see
            // ClanShieldListener (first-claim-lock model).
            Bukkit.getScheduler().runTaskLater(plugin,
                    () -> plugin.getClanShieldListener().reconcileHeld(event.getPlayer()),
                    2L);
        }

        if (plugin.isUpdateAvailable()
                && event.getPlayer().hasPermission("clancapes.admin")) {
            var p = event.getPlayer();
            p.sendMessage(Msg.info("Update available — Crestoria v" + plugin.getLatestVersion() + "."));
            String url = plugin.getUpdateUrl();
            if (!url.isEmpty()) {
                p.sendMessage(Component.text("  " + url, Msg.LINK)
                        .clickEvent(ClickEvent.openUrl(url))
                        .hoverEvent(HoverEvent.showText(Component.text(
                                "Click to open the download page", Msg.MUTE))));
            }
            // 1.0.11: if the plugin has already auto-downloaded the
            // new jar to plugins/update/, surface that instead of the
            // old "manual install only" line.
            boolean autoStaged = plugin.getServer().getUpdateFolderFile().toPath()
                    .resolve("Crestoria-" + plugin.getLatestVersion() + ".jar")
                    .toFile().isFile();
            if (autoStaged) {
                p.sendMessage(Msg.line("  Downloaded — restart the server to apply.", Msg.OK));
            } else {
                p.sendMessage(Msg.line("  Manual install only — don't hot-swap a live jar.", Msg.MUTE));
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
                    joining.sendMessage(Msg.info(
                            "You have " + invites.size() + " pending clan invitation"
                                    + (invites.size() == 1 ? "" : "s") + ":"));
                    for (InvitationDto i : invites) {
                        renderInvite(joining, i);
                    }
                    joining.sendMessage(Msg.line(
                            "  Use /clan accept <TAG> or /clan decline <TAG>.", Msg.MUTE));
                }));
    }

    /** Per-invitation line with clickable accept / decline. */
    private static void renderInvite(Player p, InvitationDto i) {
        Component accept = Component.text("[Accept]", Msg.OK, TextDecoration.BOLD)
                .clickEvent(ClickEvent.runCommand("/clan accept " + i.clanTag))
                .hoverEvent(HoverEvent.showText(
                        Component.text("Click to join " + i.clanTag, Msg.MUTE)));
        Component decline = Component.text("[Decline]", Msg.ERR, TextDecoration.BOLD)
                .clickEvent(ClickEvent.runCommand("/clan decline " + i.clanTag))
                .hoverEvent(HoverEvent.showText(
                        Component.text("Click to decline", Msg.MUTE)));
        p.sendMessage(Component.text("  ")
                .append(Msg.tag(i.clanTag))
                .append(Component.text(" " + i.clanName, Msg.INFO))
                .append(Component.text("   ", Msg.MUTE)).append(accept)
                .append(Component.text("   ", Msg.MUTE)).append(decline));
    }
}
