package dev.clancapes.command;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.clan.Clan;
import dev.clancapes.clan.ClanMember;
import dev.clancapes.clan.ClanRepository;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;

import java.util.Optional;

/**
 * Clan-only chat command — {@code /clanc <message>} (aliases: cc, clanchat).
 *
 * Broadcasts the message exclusively to currently-online members of
 * the sender's clan. Unclanned senders get a polite rejection. Format
 * uses legacy &-codes so every client renders consistently without
 * an Adventure component round-trip:
 *
 *   §8[§7CC§8] §8[§fTAG§8] §fSender §8» §7message
 *
 * No persistence — clan chat is fire-and-forget by design, mirroring
 * Discord's "ephemeral" channel semantics for in-game ops chatter.
 */
public final class ClanChatCommand implements CommandExecutor {
    private final ClanCapesPlugin plugin;

    public ClanChatCommand(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, @NotNull String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only.");
            return true;
        }
        if (args.length == 0) {
            player.sendMessage("§7Usage: §f/clanc <message>");
            return true;
        }

        ClanRepository repo = plugin.getClanRepository();
        if (repo == null) {
            player.sendMessage("§cClan system not loaded yet, try again in a second.");
            return true;
        }
        Optional<Clan> mine = repo.byPlayer(player.getUniqueId());
        if (mine.isEmpty()) {
            player.sendMessage("§cYou're not in a clan.");
            return true;
        }
        Clan clan = mine.get();

        // Concatenate args back into a single message — Bukkit splits
        // on whitespace, but we want the original spacing preserved
        // verbatim (trimmed).
        String message = String.join(" ", args).trim();
        if (message.isEmpty()) {
            player.sendMessage("§7Usage: §f/clanc <message>");
            return true;
        }

        String line = "§8[§7CC§8] §8[§f" + clan.tag() + "§8] §f"
                + player.getName() + " §8» §7" + message;

        int delivered = 0;
        for (ClanMember member : clan.members()) {
            Player recipient = Bukkit.getPlayer(member.playerUuid());
            if (recipient == null || !recipient.isOnline()) {
                continue;
            }
            recipient.sendMessage(line);
            delivered++;
        }

        if (delivered == 0) {
            // Sender is the only online member — echo back so they at
            // least see the message they tried to send.
            player.sendMessage(line);
            player.sendMessage("§8(no other clan members online)");
        }
        return true;
    }
}
