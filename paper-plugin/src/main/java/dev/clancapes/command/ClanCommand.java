package dev.clancapes.command;

import com.google.gson.JsonObject;
import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.api.dto.ClanDto;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;

import java.util.Locale;
import java.util.UUID;

/**
 * Player-facing clan command. Dispatches to the panel API for any
 * mutation; reads from the local cache for /info and /list. Async
 * panel calls hop back to the main thread before talking to the
 * sender, so the player never sees a thread-violation error.
 */
public final class ClanCommand implements CommandExecutor {

    private final ClanCapesPlugin plugin;

    public ClanCommand(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            return showHelp(sender);
        }
        String sub = args[0].toLowerCase(Locale.ROOT);
        return switch (sub) {
            case "create" -> doCreate(sender, args);
            case "disband" -> doDisband(sender);
            case "info" -> doInfo(sender, args);
            case "list" -> doList(sender);
            case "leave" -> doLeave(sender);
            case "kick" -> doKick(sender, args);
            case "promote" -> doRole(sender, args, "deputy");
            case "demote" -> doRole(sender, args, "member");
            case "transfer" -> doTransfer(sender, args);
            case "color" -> doColor(sender, args);
            case "panel" -> doPanel(sender);
            case "menu" -> doMenu(sender);
            case "invite", "accept", "decline" -> {
                sender.sendMessage(Component.text(
                        "Invites are not implemented in this build. Ask an admin to add you via /dashboard/clans.",
                        NamedTextColor.GRAY));
                yield true;
            }
            default -> showHelp(sender);
        };
    }

    private boolean showHelp(CommandSender sender) {
        sender.sendMessage(Component.text("/clan <subcommand>", NamedTextColor.GOLD));
        sender.sendMessage(Component.text("  create <TAG> <name>   create a clan", NamedTextColor.GRAY));
        sender.sendMessage(Component.text("  info [tag]            show clan info", NamedTextColor.GRAY));
        sender.sendMessage(Component.text("  list                  list all clans", NamedTextColor.GRAY));
        sender.sendMessage(Component.text("  leave                 leave your clan", NamedTextColor.GRAY));
        sender.sendMessage(Component.text("  kick <player>         kick a member (leader/deputy)", NamedTextColor.GRAY));
        sender.sendMessage(Component.text("  promote/demote <p>    change role (leader only)", NamedTextColor.GRAY));
        sender.sendMessage(Component.text("  transfer <player>     transfer leadership", NamedTextColor.GRAY));
        sender.sendMessage(Component.text("  color <#RRGGBB>       set clan colour", NamedTextColor.GRAY));
        sender.sendMessage(Component.text("  panel                 open web management panel", NamedTextColor.GRAY));
        sender.sendMessage(Component.text("  menu                  open the clan chest GUI", NamedTextColor.GRAY));
        return true;
    }

    private boolean doMenu(CommandSender sender) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        ClanMenu.open(player);
        return true;
    }

    private Player requirePlayer(CommandSender sender) {
        if (sender instanceof Player p) return p;
        sender.sendMessage(Component.text("Player only.", NamedTextColor.RED));
        return null;
    }

    private ClanDto requireOwnClan(Player player) {
        ClanDto clan = plugin.getClanRepository().getByPlayer(player.getUniqueId()).orElse(null);
        if (clan == null) {
            player.sendMessage(Component.text("You are not in a clan.", NamedTextColor.RED));
        }
        return clan;
    }

    private boolean isLeader(ClanDto clan, UUID uuid) {
        if (clan.members == null) return false;
        return clan.members.stream().anyMatch(m ->
                "leader".equalsIgnoreCase(m.role)
                && uuid.toString().equalsIgnoreCase(m.playerUuid));
    }

    private boolean isLeaderOrDeputy(ClanDto clan, UUID uuid) {
        if (clan.members == null) return false;
        return clan.members.stream().anyMatch(m -> {
            String r = m.role == null ? "" : m.role.toLowerCase();
            return (r.equals("leader") || r.equals("deputy"))
                    && uuid.toString().equalsIgnoreCase(m.playerUuid);
        });
    }

    // ─────────────────────── subcommands ───────────────────────

    private boolean doCreate(CommandSender sender, String[] args) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        if (args.length < 3) {
            player.sendMessage(Component.text("Usage: /clan create <TAG> <name…>", NamedTextColor.RED));
            return true;
        }
        String tag = args[1].toUpperCase(Locale.ROOT);
        String name = String.join(" ", java.util.Arrays.copyOfRange(args, 2, args.length));
        if (!plugin.getPanelClient().isConfigured()) {
            player.sendMessage(Component.text("Panel not linked. Ask an admin to run /clancape setup.",
                    NamedTextColor.RED));
            return true;
        }

        plugin.getPanelClient().createClan(tag, name, player.getUniqueId(), player.getName(), null)
                .whenComplete((dto, err) -> back(() -> {
                    if (err != null) {
                        player.sendMessage(Component.text("Could not create clan: " + msg(err),
                                NamedTextColor.RED));
                    } else {
                        player.sendMessage(Component.text("Clan [" + dto.tag + "] " + dto.name + " created.",
                                NamedTextColor.GREEN));
                        plugin.getClanRepository().refresh();
                    }
                }));
        return true;
    }

    private boolean doDisband(CommandSender sender) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        ClanDto clan = requireOwnClan(player);
        if (clan == null) return true;
        if (!isLeader(clan, player.getUniqueId())) {
            player.sendMessage(Component.text("Only the leader can disband.", NamedTextColor.RED));
            return true;
        }
        player.sendMessage(Component.text(
                "Disband is admin-only in this build. Use /dashboard/clans → Disband.",
                NamedTextColor.GRAY));
        return true;
    }

    private boolean doInfo(CommandSender sender, String[] args) {
        ClanDto clan;
        if (args.length >= 2) {
            clan = plugin.getClanRepository().getByTag(args[1]).orElse(null);
        } else {
            if (!(sender instanceof Player p)) {
                sender.sendMessage(Component.text("Pass a tag: /clan info <TAG>", NamedTextColor.RED));
                return true;
            }
            clan = plugin.getClanRepository().getByPlayer(p.getUniqueId()).orElse(null);
        }
        if (clan == null) {
            sender.sendMessage(Component.text("Clan not found.", NamedTextColor.RED));
            return true;
        }
        TextColor color = parseColor(clan.colorHex);
        sender.sendMessage(Component.text("[" + clan.tag + "] " + clan.name, color));
        sender.sendMessage(Component.text("Members: "
                + (clan.members == null ? 0 : clan.members.size()), NamedTextColor.GRAY));
        if (clan.stats != null) {
            sender.sendMessage(Component.text(
                    "K/D: " + clan.stats.kills + "/" + clan.stats.deaths
                            + " (" + String.format(Locale.ROOT, "%.2f", clan.stats.kd) + ")",
                    NamedTextColor.GRAY));
        }
        // Friendly-fire status — surfaced only when the clan has explicitly
        // opted out, since the default-on case is the silent baseline.
        if (Boolean.FALSE.equals(clan.friendlyFire)) {
            sender.sendMessage(Component.text(
                    "Friendly fire: OFF (intra-clan damage blocked)", NamedTextColor.GRAY));
        }
        // Pinned announcement, if any. Body is plain text capped at 500 chars
        // server-side; render it as a single italic line under a header so
        // long announcements wrap naturally in the vanilla chat box.
        plugin.getAnnouncementRepository().get(clan.tag).ifPresent(a -> {
            sender.sendMessage(Component.text("Announcement:", NamedTextColor.GOLD));
            sender.sendMessage(Component.text("  " + a.body, NamedTextColor.WHITE));
        });
        return true;
    }

    private boolean doList(CommandSender sender) {
        var clans = plugin.getClanRepository().all();
        if (clans.isEmpty()) {
            sender.sendMessage(Component.text("No clans on this server.", NamedTextColor.GRAY));
            return true;
        }
        sender.sendMessage(Component.text("Clans (" + clans.size() + "):", NamedTextColor.GOLD));
        for (ClanDto c : clans) {
            int size = c.members == null ? 0 : c.members.size();
            sender.sendMessage(Component.text("  [" + c.tag + "] " + c.name + " — " + size + " members",
                    parseColor(c.colorHex)));
        }
        return true;
    }

    private boolean doLeave(CommandSender sender) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        ClanDto clan = requireOwnClan(player);
        if (clan == null) return true;
        if (isLeader(clan, player.getUniqueId())) {
            player.sendMessage(Component.text(
                    "Leader cannot leave. Transfer leadership first.", NamedTextColor.RED));
            return true;
        }
        plugin.getPanelClient().removeMember(clan.tag, player.getUniqueId(), player.getUniqueId())
                .whenComplete((res, err) -> back(() -> {
                    if (err != null) {
                        player.sendMessage(Component.text(
                                "Could not leave: " + msg(err), NamedTextColor.RED));
                    } else {
                        player.sendMessage(Component.text("You left [" + clan.tag + "].",
                                NamedTextColor.YELLOW));
                        plugin.getClanRepository().refresh();
                    }
                }));
        return true;
    }

    private boolean doKick(CommandSender sender, String[] args) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        if (args.length < 2) {
            player.sendMessage(Component.text("Usage: /clan kick <player>", NamedTextColor.RED));
            return true;
        }
        ClanDto clan = requireOwnClan(player);
        if (clan == null) return true;
        if (!isLeaderOrDeputy(clan, player.getUniqueId())) {
            player.sendMessage(Component.text("Only leader or deputy can kick.", NamedTextColor.RED));
            return true;
        }
        OfflinePlayer target = Bukkit.getOfflinePlayer(args[1]);
        // OfflinePlayer.getUniqueId() never returns null — Bukkit hashes
        // the name into an offline-mode UUID even when Mojang has never
        // seen the player. Gate on hasPlayedBefore() / isOnline() so a
        // typo can't kick a player who has never joined this server.
        if (!target.hasPlayedBefore() && !target.isOnline()) {
            player.sendMessage(Component.text(
                    "Unknown player — never seen on this server.", NamedTextColor.RED));
            return true;
        }
        plugin.getPanelClient().removeMember(clan.tag, target.getUniqueId(), player.getUniqueId())
                .whenComplete((res, err) -> back(() -> {
                    if (err != null) {
                        player.sendMessage(Component.text(
                                "Could not kick: " + msg(err), NamedTextColor.RED));
                    } else {
                        player.sendMessage(Component.text("Kicked " + target.getName() + ".",
                                NamedTextColor.YELLOW));
                        plugin.getClanRepository().refresh();
                    }
                }));
        return true;
    }

    private boolean doRole(CommandSender sender, String[] args, String role) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        if (args.length < 2) {
            player.sendMessage(Component.text("Usage: /clan promote|demote <player>", NamedTextColor.RED));
            return true;
        }
        ClanDto clan = requireOwnClan(player);
        if (clan == null) return true;
        if (!isLeader(clan, player.getUniqueId())) {
            player.sendMessage(Component.text("Only the leader can change roles.", NamedTextColor.RED));
            return true;
        }
        player.sendMessage(Component.text(
                "Role changes are admin-only in this build. Use /dashboard/clans → " + role + ".",
                NamedTextColor.GRAY));
        return true;
    }

    private boolean doTransfer(CommandSender sender, String[] args) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        if (args.length < 2) {
            player.sendMessage(Component.text("Usage: /clan transfer <player>", NamedTextColor.RED));
            return true;
        }
        ClanDto clan = requireOwnClan(player);
        if (clan == null) return true;
        if (!isLeader(clan, player.getUniqueId())) {
            player.sendMessage(Component.text("Only the leader can transfer.", NamedTextColor.RED));
            return true;
        }
        OfflinePlayer target = Bukkit.getOfflinePlayer(args[1]);
        // See kick() — OfflinePlayer.getUniqueId() never returns null.
        if (!target.hasPlayedBefore() && !target.isOnline()) {
            player.sendMessage(Component.text(
                    "Unknown player — never seen on this server.", NamedTextColor.RED));
            return true;
        }
        UUID targetUuid = target.getUniqueId();
        plugin.getPanelClient().transferLeadership(clan.tag, targetUuid, player.getUniqueId())
                .whenComplete((res, err) -> back(() -> {
                    if (err != null) {
                        player.sendMessage(Component.text(
                                "Could not transfer: " + msg(err), NamedTextColor.RED));
                    } else {
                        player.sendMessage(Component.text(
                                "Leadership transferred to " + target.getName() + ".",
                                NamedTextColor.GREEN));
                        plugin.getClanRepository().refresh();
                    }
                }));
        return true;
    }

    private boolean doColor(CommandSender sender, String[] args) {
        sender.sendMessage(Component.text(
                "Colour changes are admin-only in this build. Use /dashboard/clans → recolour.",
                NamedTextColor.GRAY));
        return true;
    }

    private boolean doPanel(CommandSender sender) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        if (!plugin.getPanelClient().isConfigured()) {
            player.sendMessage(Component.text("Panel not linked.", NamedTextColor.RED));
            return true;
        }
        ClanDto clan = requireOwnClan(player);
        if (clan == null) return true;
        if (!isLeaderOrDeputy(clan, player.getUniqueId())) {
            player.sendMessage(Component.text(
                    "Only leader or deputy can open the panel.", NamedTextColor.RED));
            return true;
        }
        int ttl = plugin.getConfig().getInt("leader-panel.token-ttl-sec", 600);
        plugin.getPanelClient().issueLeaderToken(player.getUniqueId(), ttl)
                .whenComplete((JsonObject json, Throwable err) -> back(() -> {
                    if (err != null || json == null) {
                        player.sendMessage(Component.text(
                                "Could not issue panel link: "
                                        + (err == null ? "unknown" : msg(err)),
                                NamedTextColor.RED));
                        return;
                    }
                    String url = json.has("url") && !json.get("url").isJsonNull()
                            ? json.get("url").getAsString()
                            : null;
                    String token = json.has("token") ? json.get("token").getAsString() : null;
                    if (url != null) {
                        player.sendMessage(Component.text(
                                "Open your clan panel (valid " + (ttl / 60) + " min):",
                                NamedTextColor.GOLD));
                        // Click → open browser. Shift-click would normally paste
                        // the URL into chat (vanilla behaviour), so we also wire
                        // a hover hint pointing at the action.
                        player.sendMessage(Component.text(url, NamedTextColor.AQUA)
                                .clickEvent(ClickEvent.openUrl(url))
                                .hoverEvent(HoverEvent.showText(Component.text(
                                        "Click to open in browser",
                                        NamedTextColor.GRAY))));
                    } else if (token != null) {
                        player.sendMessage(Component.text(
                                "Token (click to copy — paste at /clan-panel):",
                                NamedTextColor.GOLD));
                        final String t = token;
                        player.sendMessage(Component.text(t, NamedTextColor.YELLOW)
                                .clickEvent(ClickEvent.copyToClipboard(t))
                                .hoverEvent(HoverEvent.showText(Component.text(
                                        "Click to copy token",
                                        NamedTextColor.GRAY))));
                    }
                }));
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

    /** Hop a callback back to the Bukkit main thread before touching API. */
    private void back(Runnable r) {
        Bukkit.getScheduler().runTask(plugin, r);
    }

    /**
     * Unwrap a CompletableFuture failure to its useful message.
     *
     * <p>{@link java.util.concurrent.CompletionException} wraps the
     * actual cause and its own {@code getMessage()} is null — so the
     * naive {@code msg(err)} prints {@code "Could not X: null"}
     * to the player. Walk down to the first non-CompletionException
     * cause and prefer its message; fall back to the class name when
     * the cause itself has no message.
     */
    private static String msg(Throwable err) {
        Throwable cur = err;
        while (cur instanceof java.util.concurrent.CompletionException
                && cur.getCause() != null) {
            cur = cur.getCause();
        }
        String m = cur.getMessage();
        return m == null ? cur.getClass().getSimpleName() : m;
    }
}
