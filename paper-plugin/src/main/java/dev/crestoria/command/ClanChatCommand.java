package dev.crestoria.command;

import dev.crestoria.CrestoriaPlugin;
import dev.crestoria.api.dto.ClanDto;
import dev.crestoria.util.Msg;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

import java.util.UUID;

/**
 * Clan-only chat. Routes the message to every online member of the
 * sender's clan, prefixed with the coloured tag. Players outside the
 * clan see nothing — the panel doesn't persist clan chat either, so
 * messages are ephemeral by design.
 */
public final class ClanChatCommand implements CommandExecutor {

    private final CrestoriaPlugin plugin;

    public ClanChatCommand(CrestoriaPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Msg.err("Only players can use clan chat."));
            return true;
        }
        if (args.length == 0) {
            player.sendMessage(Msg.err("Usage:  /clanc <message>"));
            return true;
        }
        ClanDto clan = plugin.getClanRepository().getByPlayer(player.getUniqueId()).orElse(null);
        if (clan == null) {
            player.sendMessage(Msg.err("You're not in a clan yet."));
            return true;
        }
        String message = String.join(" ", args);
        TextColor color = parseColor(clan.colorHex);
        Component line = Component.text("[" + clan.tag + "] ", color)
                .append(Component.text(player.getName() + ": ", NamedTextColor.WHITE))
                .append(Component.text(message, NamedTextColor.GRAY));

        // Echo to the sender unconditionally — the cached clan.members
        // snapshot can be up to refresh-clans-sec stale, so a just-joined
        // leader otherwise wouldn't see their own message and assume it
        // didn't send.
        player.sendMessage(line);

        if (clan.members == null) return true;
        UUID self = player.getUniqueId();
        for (var m : clan.members) {
            if (m.playerUuid == null) continue;
            try {
                UUID uuid = UUID.fromString(m.playerUuid);
                if (uuid.equals(self)) continue; // already echoed above
                Player member = Bukkit.getPlayer(uuid);
                if (member != null && member.isOnline()) {
                    member.sendMessage(line);
                }
            } catch (IllegalArgumentException ignore) {
            }
        }
        return true;
    }

    private static TextColor parseColor(String hex) {
        if (hex == null || hex.isEmpty()) return NamedTextColor.WHITE;
        try {
            String h = hex.startsWith("#") ? hex.substring(1) : hex;
            return TextColor.color(Integer.parseInt(h, 16));
        } catch (NumberFormatException e) {
            return NamedTextColor.WHITE;
        }
    }
}
