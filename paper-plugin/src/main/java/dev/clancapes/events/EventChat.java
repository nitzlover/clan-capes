package dev.clancapes.events;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.Sound;
import org.bukkit.entity.Player;

/**
 * Single source for event chat + title + sound broadcasts. Keeps the
 * message vocabulary consistent across stages and out of the event
 * state machine, which only decides WHEN to call these.
 *
 * <p>All broadcasts go to the whole server — events are server-wide
 * spectacles, not clan-private. Title cards fire on stage transitions
 * for punch; plain chat lines carry the detail (coordinates, counts).
 */
public final class EventChat {

    private static final String PREFIX = "§6§l[EVENT] §r";

    private EventChat() {}

    /** Server-wide chat line with the event prefix. */
    public static void broadcast(String legacyMessage) {
        Bukkit.broadcast(Component.text(PREFIX + legacyMessage));
    }

    /** Stage transition — bold title + subtitle + chime to everyone. */
    public static void announceStage(String title, String subtitle) {
        Component t = Component.text(title, NamedTextColor.GOLD, TextDecoration.BOLD);
        Component s = Component.text(subtitle, NamedTextColor.GRAY);
        for (Player p : Bukkit.getOnlinePlayers()) {
            p.showTitle(net.kyori.adventure.title.Title.title(t, s));
            p.playSound(p.getLocation(), Sound.UI_TOAST_CHALLENGE_COMPLETE, 0.7f, 1.2f);
        }
        broadcast(title + " — " + subtitle);
    }

    /** Winner banner — green title + fanfare. */
    public static void announceWinner(String clanTag) {
        Component t = Component.text("AIRDROP WON", NamedTextColor.GREEN, TextDecoration.BOLD);
        Component s = Component.text("[" + clanTag + "] claims the drop", NamedTextColor.WHITE);
        for (Player p : Bukkit.getOnlinePlayers()) {
            p.showTitle(net.kyori.adventure.title.Title.title(t, s));
            p.playSound(p.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 1.0f, 1.0f);
        }
        broadcast("§a[" + clanTag + "] won the airdrop!");
    }

    /** Cancellation notice (threshold lost mid-event, operator abort). */
    public static void announceCancelled(String reason) {
        broadcast("§cEvent cancelled: " + reason);
    }
}
