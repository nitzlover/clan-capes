package dev.crestoria.command;

import com.google.gson.JsonObject;
import dev.crestoria.CrestoriaPlugin;
import dev.crestoria.api.dto.ClanDto;
import dev.crestoria.api.dto.InvitationDto;
import dev.crestoria.util.Msg;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import net.kyori.adventure.text.format.TextDecoration;
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

    private final CrestoriaPlugin plugin;

    public ClanCommand(CrestoriaPlugin plugin) {
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
            case "invite" -> doInvite(sender, args);
            case "accept" -> doAccept(sender, args);
            case "decline" -> doDecline(sender, args);
            case "shield" -> doShield(sender);
            default -> showHelp(sender);
        };
    }

    private boolean showHelp(CommandSender sender) {
        sender.sendMessage(Msg.prefix().append(Component.text("Clan commands",
                Msg.ACCENT, net.kyori.adventure.text.format.TextDecoration.BOLD)));
        helpLine(sender, "/clan create <TAG> <name>", "found a new clan");
        helpLine(sender, "/clan info [tag]", "show clan details");
        helpLine(sender, "/clan list", "browse every clan");
        helpLine(sender, "/clan invite <player>", "invite someone  (leader/deputy)");
        helpLine(sender, "/clan accept [tag]", "accept an invite");
        helpLine(sender, "/clan decline [tag]", "decline an invite");
        helpLine(sender, "/clan leave", "leave your clan");
        helpLine(sender, "/clan kick <player>", "remove a member  (leader/deputy)");
        helpLine(sender, "/clan promote|demote <p>", "change a role  (leader)");
        helpLine(sender, "/clan transfer <player>", "hand over leadership");
        helpLine(sender, "/clan color <#RRGGBB>", "set your clan colour");
        helpLine(sender, "/clan shield", "stamp your banner on a held shield");
        helpLine(sender, "/clan panel", "open the web panel");
        helpLine(sender, "/clan menu", "open the clan chest");
        return true;
    }

    private void helpLine(CommandSender sender, String cmd, String desc) {
        sender.sendMessage(Component.text()
                .append(Component.text("  " + cmd, Msg.ACCENT))
                .append(Component.text("  —  ", Msg.MUTE))
                .append(Component.text(desc, Msg.INFO))
                .build());
    }

    private boolean doMenu(CommandSender sender) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        ClanMenu.open(player);
        return true;
    }

    private Player requirePlayer(CommandSender sender) {
        if (sender instanceof Player p) return p;
        sender.sendMessage(Msg.err("Only players can use this command."));
        return null;
    }

    private ClanDto requireOwnClan(Player player) {
        ClanDto clan = plugin.getClanRepository().getByPlayer(player.getUniqueId()).orElse(null);
        if (clan == null) {
            player.sendMessage(Msg.err("You are not in a clan yet — use /clan create or accept an invite."));
        }
        return clan;
    }

    /** Standard async-failure reply: log the raw cause, show friendly chat. */
    private void panelFail(Player player, Throwable err, String action) {
        plugin.getLogger().warning("[clan] " + action + " failed for "
                + player.getName() + ": " + msg(err));
        player.sendMessage(Msg.err(Msg.friendly(msg(err))));
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
            String r = m.role == null ? "" : m.role.toLowerCase(Locale.ROOT);
            return (r.equals("leader") || r.equals("deputy"))
                    && uuid.toString().equalsIgnoreCase(m.playerUuid);
        });
    }

    // ─────────────────────── subcommands ───────────────────────

    private boolean doCreate(CommandSender sender, String[] args) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        if (args.length < 3) {
            player.sendMessage(Msg.err("Usage:  /clan create <TAG> <name>"));
            return true;
        }
        String tag = args[1].toUpperCase(Locale.ROOT);
        String name = String.join(" ", java.util.Arrays.copyOfRange(args, 2, args.length));
        if (!plugin.getPanelClient().isConfigured()) {
            player.sendMessage(Msg.err("The server isn't linked to the panel yet — ask an admin."));
            return true;
        }

        // Capture the player's intended tag locally so the success
        // message can fall back to it if the panel response somehow
        // ships a null DTO. 1.0.11 panel hotfix removed the
        // tx-isolation NPE path that caused this, but the defensive
        // null check stays so a future protocol drift can't crash
        // the chat reply silently.
        final String intendedTag = tag;
        final String intendedName = name;
        plugin.getPanelClient().createClan(tag, name, player.getUniqueId(), player.getName(), null)
                .whenComplete((dto, err) -> back(() -> {
                    if (err != null) {
                        plugin.getLogger().warning("[clan-create] " + player.getName()
                                + " tag=" + intendedTag + " FAILED: " + msg(err));
                        player.sendMessage(Msg.err(Msg.friendly(msg(err))));
                        return;
                    }
                    String t = dto != null && dto.tag != null ? dto.tag : intendedTag;
                    String n = dto != null && dto.name != null ? dto.name : intendedName;
                    plugin.getLogger().info("[clan-create] " + player.getName()
                            + " created [" + t + "] " + n
                            + (dto == null ? " (panel returned no clan object — verify)" : ""));
                    player.sendMessage(Msg.okTag("Created clan ", t, "  " + n + " — you are the leader."));
                    plugin.getClanRepository().refresh();
                }));
        return true;
    }

    private boolean doDisband(CommandSender sender) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        ClanDto clan = requireOwnClan(player);
        if (clan == null) return true;
        if (!isLeader(clan, player.getUniqueId())) {
            player.sendMessage(Msg.err("Only the leader can disband the clan."));
            return true;
        }
        final String tag = clan.tag;
        final String name = clan.name;
        plugin.getPanelClient().deleteClan(tag, player.getUniqueId())
                .whenComplete((res, err) -> back(() -> {
                    if (err != null) {
                        panelFail(player, err, "disband");
                    } else {
                        player.sendMessage(Msg.infoTag("Disbanded clan ", tag, "  " + name + "."));
                        plugin.getClanRepository().refresh();
                    }
                }));
        return true;
    }

    private boolean doInfo(CommandSender sender, String[] args) {
        ClanDto clan;
        if (args.length >= 2) {
            clan = plugin.getClanRepository().getByTag(args[1]).orElse(null);
        } else {
            if (!(sender instanceof Player p)) {
                sender.sendMessage(Msg.err("Specify a tag:  /clan info <TAG>"));
                return true;
            }
            clan = plugin.getClanRepository().getByPlayer(p.getUniqueId()).orElse(null);
        }
        if (clan == null) {
            sender.sendMessage(Msg.err("No clan with that tag."));
            return true;
        }
        TextColor color = parseColor(clan.colorHex);
        sender.sendMessage(Msg.prefix()
                .append(Component.text(clan.name, color, net.kyori.adventure.text.format.TextDecoration.BOLD))
                .append(Component.text("  [" + clan.tag + "]", color)));
        sender.sendMessage(Msg.line("  Members        ", Msg.MUTE)
                .append(Component.text(String.valueOf(clan.members == null ? 0 : clan.members.size()), Msg.INFO)));
        if (clan.stats != null) {
            sender.sendMessage(Msg.line("  Kills / Deaths ", Msg.MUTE)
                    .append(Component.text(clan.stats.kills + " / " + clan.stats.deaths
                            + "  (" + String.format(Locale.ROOT, "%.2f", clan.stats.kd) + " K/D)", Msg.INFO)));
        }
        // Friendly-fire status — surfaced only when the clan has explicitly
        // opted out, since the default-on case is the silent baseline.
        if (Boolean.FALSE.equals(clan.friendlyFire)) {
            sender.sendMessage(Msg.line("  Friendly fire  ", Msg.MUTE)
                    .append(Component.text("off — clanmates can't hurt each other", Msg.INFO)));
        }
        // Pinned announcement, if any (rendered as a quoted accent line).
        plugin.getAnnouncementRepository().get(clan.tag).ifPresent(a ->
                sender.sendMessage(Msg.line("  “" + a.body + "”", Msg.ACCENT)));
        return true;
    }

    private boolean doList(CommandSender sender) {
        var clans = plugin.getClanRepository().all();
        if (clans.isEmpty()) {
            sender.sendMessage(Msg.info("No clans yet — be the first with /clan create."));
            return true;
        }
        sender.sendMessage(Msg.prefix()
                .append(Component.text("Clans ", Msg.ACCENT, net.kyori.adventure.text.format.TextDecoration.BOLD))
                .append(Component.text("(" + clans.size() + ")", Msg.MUTE)));
        for (ClanDto c : clans) {
            int size = c.members == null ? 0 : c.members.size();
            sender.sendMessage(Component.text()
                    .append(Component.text("  [" + c.tag + "] ", parseColor(c.colorHex)))
                    .append(Component.text(c.name, Msg.INFO))
                    .append(Component.text("  ·  " + size + (size == 1 ? " member" : " members"), Msg.MUTE))
                    .build());
        }
        return true;
    }

    private boolean doLeave(CommandSender sender) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        ClanDto clan = requireOwnClan(player);
        if (clan == null) return true;
        if (isLeader(clan, player.getUniqueId())) {
            player.sendMessage(Msg.err("Leaders can't leave — transfer leadership first  (/clan transfer)."));
            return true;
        }
        plugin.getPanelClient().removeMember(clan.tag, player.getUniqueId(), player.getUniqueId())
                .whenComplete((res, err) -> back(() -> {
                    if (err != null) {
                        panelFail(player, err, "leave");
                    } else {
                        player.sendMessage(Msg.infoTag("You left ", clan.tag, "."));
                        plugin.getClanRepository().refresh();
                    }
                }));
        return true;
    }

    private boolean doKick(CommandSender sender, String[] args) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        if (args.length < 2) {
            player.sendMessage(Msg.err("Usage:  /clan kick <player>"));
            return true;
        }
        ClanDto clan = requireOwnClan(player);
        if (clan == null) return true;
        if (!isLeaderOrDeputy(clan, player.getUniqueId())) {
            player.sendMessage(Msg.err("Only the leader or a deputy can kick."));
            return true;
        }
        OfflinePlayer target = Bukkit.getOfflinePlayer(args[1]);
        // OfflinePlayer.getUniqueId() never returns null — Bukkit hashes
        // the name into an offline-mode UUID even when Mojang has never
        // seen the player. Gate on hasPlayedBefore() / isOnline() so a
        // typo can't kick a player who has never joined this server.
        if (!target.hasPlayedBefore() && !target.isOnline()) {
            player.sendMessage(Msg.err("That player has never joined this server."));
            return true;
        }
        plugin.getPanelClient().removeMember(clan.tag, target.getUniqueId(), player.getUniqueId())
                .whenComplete((res, err) -> back(() -> {
                    if (err != null) {
                        panelFail(player, err, "kick");
                    } else {
                        player.sendMessage(Msg.info("Kicked " + target.getName() + " from the clan."));
                        plugin.getClanRepository().refresh();
                    }
                }));
        return true;
    }

    private boolean doRole(CommandSender sender, String[] args, String role) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        if (args.length < 2) {
            player.sendMessage(Msg.err("Usage:  /clan promote|demote <player>"));
            return true;
        }
        ClanDto clan = requireOwnClan(player);
        if (clan == null) return true;
        if (!isLeader(clan, player.getUniqueId())) {
            player.sendMessage(Msg.err("Only the leader can change roles."));
            return true;
        }
        OfflinePlayer target = Bukkit.getOfflinePlayer(args[1]);
        if (!target.hasPlayedBefore() && !target.isOnline()) {
            player.sendMessage(Msg.err("That player has never joined this server."));
            return true;
        }
        UUID targetUuid = target.getUniqueId();
        // Refuse to promote/demote yourself or the existing leader — the
        // panel route would 400/409 anyway but echoing the rule locally
        // keeps the error message in the player's vocabulary.
        if (targetUuid.equals(player.getUniqueId())) {
            player.sendMessage(Msg.err("You can't change your own role."));
            return true;
        }
        if (!isMemberOfClan(clan, targetUuid)) {
            player.sendMessage(Msg.err(target.getName() + " isn't in your clan."));
            return true;
        }
        final String targetName = target.getName() == null ? args[1] : target.getName();
        plugin.getPanelClient().updateMemberRole(clan.tag, targetUuid, role, player.getUniqueId())
                .whenComplete((res, err) -> back(() -> {
                    if (err != null) {
                        panelFail(player, err, "role-change");
                    } else {
                        player.sendMessage(Msg.ok(targetName + " is now "
                                + ("deputy".equals(role) ? "a deputy" : "a member") + "."));
                        plugin.getClanRepository().refresh();
                    }
                }));
        return true;
    }

    /** True if the target uuid appears in the cached clan member list. */
    private boolean isMemberOfClan(ClanDto clan, UUID uuid) {
        if (clan.members == null) return false;
        String s = uuid.toString();
        return clan.members.stream().anyMatch(m -> s.equalsIgnoreCase(m.playerUuid));
    }

    private boolean doTransfer(CommandSender sender, String[] args) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        if (args.length < 2) {
            player.sendMessage(Msg.err("Usage:  /clan transfer <player>"));
            return true;
        }
        ClanDto clan = requireOwnClan(player);
        if (clan == null) return true;
        if (!isLeader(clan, player.getUniqueId())) {
            player.sendMessage(Msg.err("Only the leader can transfer leadership."));
            return true;
        }
        OfflinePlayer target = Bukkit.getOfflinePlayer(args[1]);
        // See kick() — OfflinePlayer.getUniqueId() never returns null.
        if (!target.hasPlayedBefore() && !target.isOnline()) {
            player.sendMessage(Msg.err("That player has never joined this server."));
            return true;
        }
        UUID targetUuid = target.getUniqueId();
        plugin.getPanelClient().transferLeadership(clan.tag, targetUuid, player.getUniqueId())
                .whenComplete((res, err) -> back(() -> {
                    if (err != null) {
                        panelFail(player, err, "transfer");
                    } else {
                        player.sendMessage(Msg.ok(
                                "Leadership transferred to " + target.getName() + "."));
                        plugin.getClanRepository().refresh();
                    }
                }));
        return true;
    }

    private static final java.util.regex.Pattern HEX_RE =
            java.util.regex.Pattern.compile("^#?[0-9a-fA-F]{6}$");

    private boolean doColor(CommandSender sender, String[] args) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        if (args.length < 2) {
            player.sendMessage(Msg.err("Usage:  /clan color <#RRGGBB>"));
            return true;
        }
        ClanDto clan = requireOwnClan(player);
        if (clan == null) return true;
        if (!isLeaderOrDeputy(clan, player.getUniqueId())) {
            player.sendMessage(Msg.err("Only the leader or a deputy can change the clan colour."));
            return true;
        }
        String raw = args[1].trim();
        if (!HEX_RE.matcher(raw).matches()) {
            player.sendMessage(Msg.err("Colour must look like #RRGGBB — e.g. #ff8800."));
            return true;
        }
        // Normalise to upper-case with the leading '#' so the panel
        // receives the same shape the admin UI sends.
        String hex = "#" + (raw.startsWith("#") ? raw.substring(1) : raw).toUpperCase(Locale.ROOT);
        plugin.getPanelClient().updateClan(clan.tag, null, hex, player.getUniqueId())
                .whenComplete((res, err) -> back(() -> {
                    if (err != null) {
                        panelFail(player, err, "colour-change");
                    } else {
                        player.sendMessage(Msg.ok("Clan colour set to " + hex + "."));
                        plugin.getClanRepository().refresh();
                    }
                }));
        return true;
    }

    private boolean doPanel(CommandSender sender) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        if (!plugin.getPanelClient().isConfigured()) {
            player.sendMessage(Msg.err("The server isn't linked to the panel — ask an admin."));
            return true;
        }
        ClanDto clan = requireOwnClan(player);
        if (clan == null) return true;
        if (!isLeaderOrDeputy(clan, player.getUniqueId())) {
            player.sendMessage(Msg.err("Only the leader or a deputy can open the panel."));
            return true;
        }
        int ttl = plugin.getConfig().getInt("leader-panel.token-ttl-sec", 600);
        plugin.getPanelClient().issueLeaderToken(player.getUniqueId(), ttl)
                .whenComplete((JsonObject json, Throwable err) -> back(() -> {
                    if (err != null || json == null) {
                        if (err != null) panelFail(player, err, "panel-link");
                        else player.sendMessage(Msg.err("Could not create a panel link — try again."));
                        return;
                    }
                    String url = json.has("url") && !json.get("url").isJsonNull()
                            ? json.get("url").getAsString()
                            : null;
                    String token = json.has("token") ? json.get("token").getAsString() : null;
                    if (url != null) {
                        player.sendMessage(Msg.info(
                                "Open your clan panel — valid for " + (ttl / 60) + " min:"));
                        // Click → open browser. Shift-click would normally paste
                        // the URL into chat (vanilla behaviour), so we also wire
                        // a hover hint pointing at the action.
                        player.sendMessage(Component.text("  ", Msg.MUTE)
                                .append(Component.text(url, Msg.LINK)
                                        .clickEvent(ClickEvent.openUrl(url))
                                        .hoverEvent(HoverEvent.showText(Component.text(
                                                "Click to open in your browser", Msg.MUTE)))));
                    } else if (token != null) {
                        player.sendMessage(Msg.info(
                                "Your panel token (click to copy — paste at /clan-panel):"));
                        final String t = token;
                        player.sendMessage(Component.text("  " + t, Msg.LINK)
                                .clickEvent(ClickEvent.copyToClipboard(t))
                                .hoverEvent(HoverEvent.showText(Component.text(
                                        "Click to copy", Msg.MUTE))));
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

    // ─────────────────────── /clan shield (1.0.6) ───────────────────────

    /**
     * Force-reapply the clan banner onto the player's main-hand
     * (fall-back off-hand) shield. The {@link
     * dev.crestoria.listener.ClanShieldListener} already auto-applies
     * on pickup / hand-swap / hotbar-scroll / join, so this command
     * is mostly a manual "refresh now" lever for the case where the
     * banner repo just updated and the player wants the new design
     * on their existing shield without re-equipping it.
     */
    private boolean doShield(CommandSender sender) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        ClanDto clan = requireOwnClan(player);
        if (clan == null) return true;
        // Pull the freshest banner from the panel BEFORE stamping, so a
        // design the leader just saved on /dashboard/banners is applied
        // immediately instead of waiting for the ~5-minute background
        // refresh (the "old banner got applied" report). The HTTP refresh
        // is async; hop back to the main thread to touch the inventory.
        player.sendMessage(Msg.infoTag("Fetching the latest ", clan.tag, " banner…"));
        final String tag = clan.tag;
        plugin.getBannerRepository().refresh().whenComplete((v, err) ->
                plugin.getServer().getScheduler().runTask(plugin,
                        () -> applyShieldNow(player, tag)));
        return true;
    }

    /** Main-thread shield stamp, run after the banner cache is refreshed. */
    private void applyShieldNow(Player player, String clanTag) {
        if (!player.isOnline()) return;
        var bannerOpt = plugin.getBannerRepository().get(clanTag);
        if (bannerOpt.isEmpty()) {
            player.sendMessage(Msg.errTag("Clan ", clanTag,
                    " has no banner yet — ask an admin to design one."));
            return;
        }
        org.bukkit.inventory.PlayerInventory inv = player.getInventory();
        org.bukkit.inventory.ItemStack main = inv.getItemInMainHand();
        org.bukkit.inventory.ItemStack off = inv.getItemInOffHand();
        boolean mainIsShield = main != null && main.getType() == org.bukkit.Material.SHIELD;
        boolean offIsShield = off != null && off.getType() == org.bukkit.Material.SHIELD;
        if (!mainIsShield && !offIsShield) {
            player.sendMessage(Msg.err("Hold a shield in your main or off hand to brand it."));
            return;
        }
        // Force the rewrite by clearing the marker first — the stamper
        // short-circuits when the marker already matches the clan tag,
        // which we do not want on a manual refresh. Then write the mutated
        // stack back via setItemInMainHand/OffHand — Paper 26.1.2 returns
        // a defensive copy from the getter so the mutation must be persisted.
        boolean stamped = false;
        if (mainIsShield) {
            stamped |= forceStampShield(main, bannerOpt.get(), clanTag);
            inv.setItemInMainHand(main);
        }
        if (offIsShield) {
            stamped |= forceStampShield(off, bannerOpt.get(), clanTag);
            inv.setItemInOffHand(off);
        }
        if (stamped) {
            player.sendMessage(Msg.okTag("Shield branded with the ", clanTag, " banner."));
        } else {
            player.sendMessage(Msg.err("Couldn't brand the shield — try again."));
        }
    }

    /**
     * Clear the PDC marker then delegate to the stamper. Returns true
     * when the stamper actually wrote new NBT, false otherwise.
     */
    private boolean forceStampShield(org.bukkit.inventory.ItemStack shield,
                                     dev.crestoria.api.dto.BannerDto banner,
                                     String clanTag) {
        if (shield.getItemMeta() instanceof org.bukkit.inventory.meta.BlockStateMeta meta) {
            meta.getPersistentDataContainer()
                    .remove(dev.crestoria.listener.ClanShieldStamper.SHIELD_OWNER_KEY);
            meta.getPersistentDataContainer()
                    .remove(dev.crestoria.listener.ClanShieldStamper.LEGACY_SHIELD_OWNER_KEY);
            shield.setItemMeta(meta);
        }
        return dev.crestoria.listener.ClanShieldStamper.apply(shield, banner, clanTag, plugin);
    }

    // ─────────────────────── invitations (1.0.5) ───────────────────────

    /**
     * /clan invite <player> — leader or deputy mints an invitation
     * that the invitee then accepts/declines via /clan accept|decline.
     * Default TTL = 24h, configurable via {@code invites.ttl-seconds}.
     */
    private boolean doInvite(CommandSender sender, String[] args) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        if (args.length < 2) {
            player.sendMessage(Msg.err("Usage:  /clan invite <player>"));
            return true;
        }
        ClanDto clan = requireOwnClan(player);
        if (clan == null) return true;
        if (!isLeaderOrDeputy(clan, player.getUniqueId())) {
            player.sendMessage(Msg.err("Only the leader or a deputy can invite."));
            return true;
        }
        OfflinePlayer target = Bukkit.getOfflinePlayer(args[1]);
        if (!target.hasPlayedBefore() && !target.isOnline()) {
            player.sendMessage(Msg.err("That player has never joined this server."));
            return true;
        }
        UUID targetUuid = target.getUniqueId();
        if (targetUuid.equals(player.getUniqueId())) {
            player.sendMessage(Msg.err("You can't invite yourself."));
            return true;
        }
        if (isMemberOfClan(clan, targetUuid)) {
            player.sendMessage(Msg.err(target.getName() + " is already in your clan."));
            return true;
        }
        final String targetName = target.getName() == null ? args[1] : target.getName();
        Integer ttl = plugin.getConfig().getInt("invites.ttl-seconds", 86_400);
        plugin.getPanelClient()
                .createInvite(clan.tag, targetUuid, targetName, player.getUniqueId(), ttl)
                .whenComplete((invite, err) -> back(() -> {
                    if (err != null || invite == null) {
                        if (err != null) panelFail(player, err, "invite");
                        else player.sendMessage(Msg.err("Couldn't send the invite — try again."));
                        return;
                    }
                    player.sendMessage(Msg.okTag("Invited " + targetName + " to ", clan.tag,
                            " — expires in " + (ttl / 60) + " min."));
                    Player invitee = Bukkit.getPlayer(targetUuid);
                    if (invitee != null && invitee.isOnline()) {
                        notifyInvitee(invitee, invite);
                    }
                }));
        return true;
    }

    /**
     * Tell an online invitee about an invitation. Clickable accept /
     * decline hints save them the typing.
     */
    private static void notifyInvitee(Player invitee, InvitationDto invite) {
        invitee.sendMessage(Msg.infoTag("You've been invited to ", invite.clanTag,
                " " + invite.clanName + "."));
        invitee.sendMessage(inviteButtons(invite.clanTag));
    }

    /** Clickable "  [Accept]   [Decline]" row for one invitation tag. */
    private static Component inviteButtons(String clanTag) {
        Component accept = Component.text("[Accept]", Msg.OK, TextDecoration.BOLD)
                .clickEvent(ClickEvent.runCommand("/clan accept " + clanTag))
                .hoverEvent(HoverEvent.showText(
                        Component.text("Click to join " + clanTag, Msg.MUTE)));
        Component decline = Component.text("[Decline]", Msg.ERR, TextDecoration.BOLD)
                .clickEvent(ClickEvent.runCommand("/clan decline " + clanTag))
                .hoverEvent(HoverEvent.showText(
                        Component.text("Click to decline", Msg.MUTE)));
        return Component.text("  ", Msg.MUTE).append(accept)
                .append(Component.text("   ", Msg.MUTE)).append(decline);
    }

    /**
     * /clan accept [tag] — accept a pending invitation. With no
     * argument, lists every pending clan + a clickable accept hint
     * for each.
     */
    private boolean doAccept(CommandSender sender, String[] args) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        ClanDto existing = plugin.getClanRepository().getByPlayer(player.getUniqueId()).orElse(null);
        if (existing != null) {
            player.sendMessage(Msg.errTag("You're already in ", existing.tag,
                    " — use /clan leave first."));
            return true;
        }
        plugin.getPanelClient().listPlayerInvites(player.getUniqueId())
                .whenComplete((invites, err) -> back(() -> {
                    if (err != null) {
                        panelFail(player, err, "load-invites");
                        return;
                    }
                    if (invites == null || invites.isEmpty()) {
                        player.sendMessage(Msg.info("You have no pending invitations."));
                        return;
                    }
                    if (args.length < 2) {
                        renderInviteList(player, invites);
                        return;
                    }
                    String wanted = args[1];
                    InvitationDto match = invites.stream()
                            .filter(i -> i.clanTag != null && i.clanTag.equalsIgnoreCase(wanted))
                            .findFirst().orElse(null);
                    if (match == null) {
                        player.sendMessage(Msg.errTag("No pending invitation from ", wanted, "."));
                        renderInviteList(player, invites);
                        return;
                    }
                    plugin.getPanelClient()
                            .acceptInvite(match.id, player.getUniqueId(), player.getName())
                            .whenComplete((res, e2) -> back(() -> {
                                if (e2 != null) {
                                    panelFail(player, e2, "accept-invite");
                                    return;
                                }
                                player.sendMessage(Msg.okTag("You joined ", match.clanTag,
                                        " " + match.clanName + "."));
                                plugin.getClanRepository().refresh();
                            }));
                }));
        return true;
    }

    /**
     * /clan decline [tag] — decline one pending invitation, or list
     * them when no tag is supplied.
     */
    private boolean doDecline(CommandSender sender, String[] args) {
        Player player = requirePlayer(sender);
        if (player == null) return true;
        plugin.getPanelClient().listPlayerInvites(player.getUniqueId())
                .whenComplete((invites, err) -> back(() -> {
                    if (err != null) {
                        panelFail(player, err, "load-invites");
                        return;
                    }
                    if (invites == null || invites.isEmpty()) {
                        player.sendMessage(Msg.info("You have no pending invitations."));
                        return;
                    }
                    if (args.length < 2) {
                        renderInviteList(player, invites);
                        return;
                    }
                    String wanted = args[1];
                    InvitationDto match = invites.stream()
                            .filter(i -> i.clanTag != null && i.clanTag.equalsIgnoreCase(wanted))
                            .findFirst().orElse(null);
                    if (match == null) {
                        player.sendMessage(Msg.errTag("No pending invitation from ", wanted, "."));
                        renderInviteList(player, invites);
                        return;
                    }
                    plugin.getPanelClient().declineInvite(match.id, player.getUniqueId())
                            .whenComplete((res, e2) -> back(() -> {
                                if (e2 != null) {
                                    panelFail(player, e2, "decline-invite");
                                    return;
                                }
                                player.sendMessage(Msg.infoTag("Declined the invitation from ",
                                        match.clanTag, "."));
                            }));
                }));
        return true;
    }

    /**
     * Render a list of pending invitations with clickable accept /
     * decline hints. Used both by /clan accept and /clan decline when
     * called without a tag, and by the on-join listener.
     */
    private static void renderInviteList(Player player, java.util.List<InvitationDto> invites) {
        player.sendMessage(Msg.info("Pending invitations (" + invites.size() + "):"));
        for (InvitationDto i : invites) {
            player.sendMessage(Component.text("  ")
                    .append(Msg.tag(i.clanTag))
                    .append(Component.text(" " + i.clanName, Msg.INFO))
                    .append(inviteButtons(i.clanTag)));
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
        // Surface the panel's {"error":"…"} text for a clean, actionable
        // reason instead of a raw "API 409: {json}" dump in chat.
        if (cur instanceof dev.crestoria.api.dto.ApiError api) {
            try {
                com.google.gson.JsonObject o =
                        com.google.gson.JsonParser.parseString(api.body).getAsJsonObject();
                if (o.has("error") && !o.get("error").isJsonNull()) {
                    return o.get("error").getAsString();
                }
            } catch (Throwable ignore) {
                // body wasn't JSON — fall through to the generic message
            }
            return "server error " + api.status;
        }
        String m = cur.getMessage();
        return m == null ? cur.getClass().getSimpleName() : m;
    }
}
