package dev.clancapes.command;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.clan.Clan;
import dev.clancapes.clan.ClanMember;
import dev.clancapes.clan.ClanRepository;
import dev.clancapes.clan.PendingInvites;
import dev.clancapes.panel.PanelClient;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Top-level {@code /clan …} command — the panel-backed replacement
 * for PowerClans. Subcommands:
 *
 *   /clan create &lt;tag&gt; &lt;name&gt; [#hex]
 *   /clan disband
 *   /clan info [tag]
 *   /clan list
 *   /clan invite &lt;player&gt;
 *   /clan accept [tag]
 *   /clan decline [tag]
 *   /clan leave
 *   /clan kick &lt;player&gt;
 *   /clan promote &lt;player&gt;
 *   /clan demote &lt;player&gt;
 *   /clan transfer &lt;player&gt;
 *   /clan color &lt;#hex&gt;
 *
 * Authorization is enforced locally: leader-only commands check the
 * caller's role in the cached Clan record. The panel API trusts the
 * plugin's api_key and just persists what's asked.
 */
public final class ClanCommand implements CommandExecutor, TabCompleter {
    private static final Pattern TAG_RE = Pattern.compile("^[A-Z0-9]{2,6}$");

    private final ClanCapesPlugin plugin;
    private final ClanRepository repo;
    private final PendingInvites pending;

    public ClanCommand(ClanCapesPlugin plugin, PendingInvites pending) {
        this.plugin = plugin;
        this.repo = plugin.getClanRepository();
        this.pending = pending;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, @NotNull String[] args) {
        if (args.length == 0) {
            usage(sender);
            return true;
        }
        if (!repo.isConfigured()) {
            sender.sendMessage("§cPanel not configured — operator must run /clancape link first.");
            return true;
        }

        String sub = args[0].toLowerCase(Locale.ROOT);
        return switch (sub) {
            case "create" -> handleCreate(sender, args);
            case "disband" -> handleDisband(sender);
            case "info" -> handleInfo(sender, args);
            case "list" -> handleList(sender);
            case "invite" -> handleInvite(sender, args);
            case "accept" -> handleAccept(sender, args);
            case "decline" -> handleDecline(sender, args);
            case "leave" -> handleLeave(sender);
            case "kick" -> handleKick(sender, args);
            case "promote" -> handleRole(sender, args, ClanMember.Role.DEPUTY);
            case "demote" -> handleRole(sender, args, ClanMember.Role.MEMBER);
            case "transfer" -> handleTransfer(sender, args);
            case "color", "colour" -> handleColor(sender, args);
            default -> {
                usage(sender);
                yield true;
            }
        };
    }

    private void usage(CommandSender sender) {
        sender.sendMessage("§7/clan §fcreate §7<tag> <name> [#color]");
        sender.sendMessage("§7/clan §fdisband §8| §finfo §7[tag] §8| §flist §8| §fleave");
        sender.sendMessage("§7/clan §finvite §7<player> §8| §faccept §7[tag] §8| §fdecline §7[tag]");
        sender.sendMessage("§7/clan §fkick §7<player> §8| §fpromote §7<player> §8| §fdemote §7<player>");
        sender.sendMessage("§7/clan §ftransfer §7<player> §8| §fcolor §7<#hex>");
    }

    // ──────── create ─────────────────────────────────────────────────

    private boolean handleCreate(CommandSender sender, String[] args) {
        if (!(sender instanceof Player p)) {
            sender.sendMessage("Players only.");
            return true;
        }
        if (args.length < 3) {
            sender.sendMessage("§7Usage: §f/clan create <tag> <name> [#hex]");
            return true;
        }
        // Auto-uppercase: lowercase input is accepted and normalised
        // before the regex check. Reject only if the result still
        // doesn't fit 2-6 Latin alphanumeric (non-ASCII letters fail
        // here because toUpperCase keeps them as non-ASCII).
        String tag = args[1].toUpperCase(Locale.ROOT);
        if (!TAG_RE.matcher(tag).matches()) {
            sender.sendMessage("§cTag must be 2-6 Latin letters or digits (e.g. VI, KING, K9).");
            return true;
        }
        String name = joinFrom(args, 2);
        String color = null;
        // If the last arg starts with '#' treat it as the color override.
        int lastIdx = args.length - 1;
        if (lastIdx >= 2 && args[lastIdx].startsWith("#")) {
            color = args[lastIdx];
            // Strip color from name reconstruction.
            name = joinRange(args, 2, lastIdx);
        }
        // Already in a clan?
        if (repo.byPlayer(p.getUniqueId()).isPresent()) {
            sender.sendMessage("§cYou're already in a clan.");
            return true;
        }
        final String fName = name;
        final String fColor = color;
        runAsync(() -> {
            try {
                Clan c = repo.createClan(tag, fName, p.getUniqueId(), p.getName(), fColor);
                onMain(() -> p.sendMessage("§aClan §f" + c.tag() + " §acreated. Color " + c.colorHex() + "."));
            } catch (PanelClient.PanelException e) {
                onMain(() -> p.sendMessage("§cCreate failed: " + e.getMessage()));
            }
        });
        return true;
    }

    // ──────── disband ────────────────────────────────────────────────

    private boolean handleDisband(CommandSender sender) {
        if (!(sender instanceof Player p)) return playersOnly(sender);
        Optional<Clan> opt = repo.byPlayer(p.getUniqueId());
        if (opt.isEmpty()) return notInClan(p);
        Clan c = opt.get();
        if (!c.leaderUuid().equals(p.getUniqueId())) {
            p.sendMessage("§cOnly the leader can disband.");
            return true;
        }
        runAsync(() -> {
            try {
                repo.disbandClan(c.tag(), p.getUniqueId());
                onMain(() -> p.sendMessage("§eClan §f" + c.tag() + " §edisbanded."));
            } catch (PanelClient.PanelException e) {
                onMain(() -> p.sendMessage("§cDisband failed: " + e.getMessage()));
            }
        });
        return true;
    }

    // ──────── info / list ────────────────────────────────────────────

    private boolean handleInfo(CommandSender sender, String[] args) {
        Clan c;
        if (args.length >= 2) {
            c = repo.byTag(args[1]).orElse(null);
            if (c == null) {
                sender.sendMessage("§cNo such clan.");
                return true;
            }
        } else {
            if (!(sender instanceof Player p)) return playersOnly(sender);
            c = repo.byPlayer(p.getUniqueId()).orElse(null);
            if (c == null) return notInClan(p);
        }
        sender.sendMessage("§8─ §f" + c.tag() + " §8(" + c.name() + ")");
        sender.sendMessage("§7Color §f" + c.colorHex() + " §8| §7Members §f" + c.members().size());
        for (ClanMember m : c.members()) {
            String roleColor = switch (m.role()) {
                case LEADER -> "§6";
                case DEPUTY -> "§e";
                case MEMBER -> "§7";
            };
            sender.sendMessage("  " + roleColor + m.role().name().toLowerCase() + " §f" + m.playerName());
        }
        return true;
    }

    private boolean handleList(CommandSender sender) {
        List<Clan> all = repo.all();
        if (all.isEmpty()) {
            sender.sendMessage("§7No clans on this server yet.");
            return true;
        }
        sender.sendMessage("§8─ §fClans (" + all.size() + ")");
        for (Clan c : all) {
            sender.sendMessage(" §7" + c.tag() + " §8— §f" + c.name() + " §8(" + c.members().size() + ")");
        }
        return true;
    }

    // ──────── invite / accept / decline / leave ──────────────────────

    private boolean handleInvite(CommandSender sender, String[] args) {
        if (!(sender instanceof Player p)) return playersOnly(sender);
        if (args.length < 2) {
            sender.sendMessage("§7Usage: §f/clan invite <player>");
            return true;
        }
        Optional<Clan> mine = repo.byPlayer(p.getUniqueId());
        if (mine.isEmpty()) return notInClan(p);
        Clan c = mine.get();
        ClanMember me = c.members().stream()
                .filter(m -> m.playerUuid().equals(p.getUniqueId()))
                .findFirst().orElse(null);
        if (me == null || !me.canManage()) {
            p.sendMessage("§cOnly leaders + deputies can invite.");
            return true;
        }
        Player target = Bukkit.getPlayerExact(args[1]);
        if (target == null) {
            p.sendMessage("§cPlayer not online.");
            return true;
        }
        if (repo.byPlayer(target.getUniqueId()).isPresent()) {
            p.sendMessage("§cThat player is already in a clan.");
            return true;
        }
        pending.put(target.getUniqueId(), c.tag(), p.getUniqueId());
        p.sendMessage("§aInvited §f" + target.getName() + " §ato " + c.tag() + ".");
        target.sendMessage("§e" + p.getName() + " §finvited you to clan §f" + c.tag()
                + " §8(" + c.name() + "). §7Run §f/clan accept " + c.tag() + " §7or §f/clan decline " + c.tag() + " §7within 5 min.");
        return true;
    }

    private boolean handleAccept(CommandSender sender, String[] args) {
        if (!(sender instanceof Player p)) return playersOnly(sender);
        if (repo.byPlayer(p.getUniqueId()).isPresent()) {
            p.sendMessage("§cYou're already in a clan.");
            return true;
        }
        String tag = resolveInvitedTag(p, args);
        if (tag == null) return true;
        Clan c = repo.byTag(tag).orElse(null);
        if (c == null) {
            p.sendMessage("§cClan no longer exists.");
            pending.remove(p.getUniqueId(), tag);
            return true;
        }
        // Snapshot the inviter UUID before we consume the entry —
        // it's used to ping them on success.
        var inviteEntry = pending.get(p.getUniqueId(), tag);
        UUID inviterUuid = inviteEntry == null ? null : inviteEntry.inviter();

        runAsync(() -> {
            try {
                repo.addMember(c.tag(), p.getUniqueId(), p.getName(), ClanMember.Role.MEMBER, p.getUniqueId());
                pending.remove(p.getUniqueId(), c.tag());
                onMain(() -> {
                    p.sendMessage("§aJoined clan §f" + c.tag() + "§a.");
                    // Notify the inviter (if still online).
                    Player inviter = inviterUuid != null
                            ? Bukkit.getPlayer(inviterUuid) : null;
                    if (inviter != null && inviter.isOnline() && !inviter.equals(p)) {
                        inviter.sendMessage("§a" + p.getName() + " §faccepted your invite to §f" + c.tag() + "§a.");
                    }
                    // Broadcast to every other online member so the clan
                    // knows their roster grew.
                    for (ClanMember m : c.members()) {
                        if (m.playerUuid().equals(p.getUniqueId())) continue;
                        if (inviterUuid != null && m.playerUuid().equals(inviterUuid)) continue;
                        Player member = Bukkit.getPlayer(m.playerUuid());
                        if (member != null && member.isOnline()) {
                            member.sendMessage("§7" + p.getName() + " §7joined clan §f" + c.tag() + "§7.");
                        }
                    }
                });
            } catch (PanelClient.PanelException e) {
                onMain(() -> p.sendMessage("§cJoin failed: " + e.getMessage()));
            }
        });
        return true;
    }

    private boolean handleDecline(CommandSender sender, String[] args) {
        if (!(sender instanceof Player p)) return playersOnly(sender);
        String tag = resolveInvitedTag(p, args);
        if (tag == null) return true;
        var entry = pending.get(p.getUniqueId(), tag);
        pending.remove(p.getUniqueId(), tag);
        p.sendMessage("§7Declined invite from §f" + tag + "§7.");
        // Ping the inviter so they don't sit waiting.
        if (entry != null) {
            Player inviter = Bukkit.getPlayer(entry.inviter());
            if (inviter != null && inviter.isOnline()) {
                inviter.sendMessage("§e" + p.getName() + " §7declined your invite to §f" + tag + "§7.");
            }
        }
        return true;
    }

    private String resolveInvitedTag(Player p, String[] args) {
        if (args.length >= 2) {
            String tag = args[1].toUpperCase(Locale.ROOT);
            if (!pending.has(p.getUniqueId(), tag)) {
                p.sendMessage("§cNo pending invite from §f" + tag + "§c.");
                return null;
            }
            return tag;
        }
        var pendingList = pending.pendingFor(p.getUniqueId());
        if (pendingList.size() == 1) return pendingList.iterator().next();
        if (pendingList.isEmpty()) {
            p.sendMessage("§cNo pending invites.");
            return null;
        }
        p.sendMessage("§eYou have multiple invites: §f" + String.join(", ", pendingList) + "§e. Pass the tag.");
        return null;
    }

    private boolean handleLeave(CommandSender sender) {
        if (!(sender instanceof Player p)) return playersOnly(sender);
        Optional<Clan> opt = repo.byPlayer(p.getUniqueId());
        if (opt.isEmpty()) return notInClan(p);
        Clan c = opt.get();
        if (c.leaderUuid().equals(p.getUniqueId())) {
            p.sendMessage("§cLeader can't leave — use §f/clan transfer §cfirst, or §f/clan disband§c.");
            return true;
        }
        runAsync(() -> {
            try {
                repo.removeMember(c.tag(), p.getUniqueId(), p.getUniqueId());
                onMain(() -> p.sendMessage("§7Left clan §f" + c.tag() + "."));
            } catch (PanelClient.PanelException e) {
                onMain(() -> p.sendMessage("§cLeave failed: " + e.getMessage()));
            }
        });
        return true;
    }

    // ──────── kick / promote / demote / transfer / color ─────────────

    private boolean handleKick(CommandSender sender, String[] args) {
        if (!(sender instanceof Player p)) return playersOnly(sender);
        if (args.length < 2) {
            p.sendMessage("§7Usage: §f/clan kick <player>");
            return true;
        }
        Clan c = requireManagedClan(p);
        if (c == null) return true;
        ClanMember target = findMember(c, args[1]);
        if (target == null) {
            p.sendMessage("§cThat player isn't in your clan.");
            return true;
        }
        if (target.isLeader()) {
            p.sendMessage("§cCan't kick the leader.");
            return true;
        }
        runAsync(() -> {
            try {
                repo.removeMember(c.tag(), target.playerUuid(), p.getUniqueId());
                onMain(() -> p.sendMessage("§eKicked §f" + target.playerName() + "§e."));
            } catch (PanelClient.PanelException e) {
                onMain(() -> p.sendMessage("§cKick failed: " + e.getMessage()));
            }
        });
        return true;
    }

    private boolean handleRole(CommandSender sender, String[] args, ClanMember.Role newRole) {
        if (!(sender instanceof Player p)) return playersOnly(sender);
        if (args.length < 2) {
            p.sendMessage("§7Usage: §f/clan " + args[0] + " <player>");
            return true;
        }
        Clan c = requireLeaderClan(p);
        if (c == null) return true;
        ClanMember target = findMember(c, args[1]);
        if (target == null) {
            p.sendMessage("§cThat player isn't in your clan.");
            return true;
        }
        if (target.isLeader()) {
            p.sendMessage("§cThe leader's role is locked.");
            return true;
        }
        if (target.role() == newRole) {
            p.sendMessage("§cAlready " + newRole.name().toLowerCase() + ".");
            return true;
        }
        runAsync(() -> {
            try {
                repo.changeRole(c.tag(), target.playerUuid(), newRole, p.getUniqueId());
                onMain(() -> p.sendMessage("§aSet §f" + target.playerName() + " §a→ " + newRole.name().toLowerCase()));
            } catch (PanelClient.PanelException e) {
                onMain(() -> p.sendMessage("§cFailed: " + e.getMessage()));
            }
        });
        return true;
    }

    private boolean handleTransfer(CommandSender sender, String[] args) {
        if (!(sender instanceof Player p)) return playersOnly(sender);
        if (args.length < 2) {
            p.sendMessage("§7Usage: §f/clan transfer <player>");
            return true;
        }
        Clan c = requireLeaderClan(p);
        if (c == null) return true;
        ClanMember target = findMember(c, args[1]);
        if (target == null) {
            p.sendMessage("§cThat player isn't in your clan.");
            return true;
        }
        if (target.isLeader()) {
            p.sendMessage("§cAlready leader.");
            return true;
        }
        runAsync(() -> {
            try {
                repo.transferLeader(c.tag(), target.playerUuid(), p.getUniqueId());
                onMain(() -> p.sendMessage("§aTransferred leadership to §f" + target.playerName() + "§a."));
            } catch (PanelClient.PanelException e) {
                onMain(() -> p.sendMessage("§cTransfer failed: " + e.getMessage()));
            }
        });
        return true;
    }

    private boolean handleColor(CommandSender sender, String[] args) {
        if (!(sender instanceof Player p)) return playersOnly(sender);
        if (args.length < 2) {
            p.sendMessage("§7Usage: §f/clan color <#rrggbb>");
            return true;
        }
        Clan c = requireLeaderClan(p);
        if (c == null) return true;
        String color = args[1];
        if (!color.matches("^#[0-9a-fA-F]{6}$")) {
            p.sendMessage("§cColor must look like #RRGGBB.");
            return true;
        }
        runAsync(() -> {
            try {
                repo.editClan(c.tag(), null, color, p.getUniqueId());
                onMain(() -> p.sendMessage("§aColor set to §f" + color.toUpperCase() + "§a."));
            } catch (PanelClient.PanelException e) {
                onMain(() -> p.sendMessage("§cFailed: " + e.getMessage()));
            }
        });
        return true;
    }

    // ──────── helpers ────────────────────────────────────────────────

    private Clan requireManagedClan(Player p) {
        Optional<Clan> opt = repo.byPlayer(p.getUniqueId());
        if (opt.isEmpty()) {
            notInClan(p);
            return null;
        }
        Clan c = opt.get();
        ClanMember me = c.members().stream()
                .filter(m -> m.playerUuid().equals(p.getUniqueId()))
                .findFirst().orElse(null);
        if (me == null || !me.canManage()) {
            p.sendMessage("§cLeader or deputy only.");
            return null;
        }
        return c;
    }

    private Clan requireLeaderClan(Player p) {
        Optional<Clan> opt = repo.byPlayer(p.getUniqueId());
        if (opt.isEmpty()) {
            notInClan(p);
            return null;
        }
        Clan c = opt.get();
        if (!c.leaderUuid().equals(p.getUniqueId())) {
            p.sendMessage("§cLeader only.");
            return null;
        }
        return c;
    }

    private ClanMember findMember(Clan c, String nameOrUuid) {
        for (ClanMember m : c.members()) {
            if (m.playerName().equalsIgnoreCase(nameOrUuid)) return m;
        }
        try {
            UUID u = UUID.fromString(nameOrUuid);
            for (ClanMember m : c.members()) {
                if (m.playerUuid().equals(u)) return m;
            }
        } catch (IllegalArgumentException ignored) {
            // Name path only.
        }
        // Fallback: resolve offline player and check
        OfflinePlayer op = Bukkit.getOfflinePlayer(nameOrUuid);
        if (op != null && op.getUniqueId() != null) {
            for (ClanMember m : c.members()) {
                if (m.playerUuid().equals(op.getUniqueId())) return m;
            }
        }
        return null;
    }

    private boolean playersOnly(CommandSender sender) {
        sender.sendMessage("Players only.");
        return true;
    }

    private boolean notInClan(Player p) {
        p.sendMessage("§cYou're not in a clan.");
        return true;
    }

    private String joinFrom(String[] args, int start) {
        return joinRange(args, start, args.length);
    }

    private String joinRange(String[] args, int from, int toExclusive) {
        StringBuilder sb = new StringBuilder();
        for (int i = from; i < toExclusive; i++) {
            if (sb.length() > 0) sb.append(' ');
            sb.append(args[i]);
        }
        return sb.toString();
    }

    private void runAsync(Runnable r) {
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, r);
    }

    private void onMain(Runnable r) {
        plugin.getServer().getScheduler().runTask(plugin, r);
    }

    private static final List<String> SUBS = List.of(
            "create", "disband", "info", "list", "invite", "accept", "decline",
            "leave", "kick", "promote", "demote", "transfer", "color"
    );
    /** Subcommands that take a player name as their second argument. */
    private static final java.util.Set<String> PLAYER_SUBS = java.util.Set.of(
            "invite", "kick", "promote", "demote", "transfer"
    );

    @Override
    public @Nullable List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command,
                                                 @NotNull String alias, @NotNull String[] args) {
        List<String> out = new ArrayList<>();
        if (args.length == 1) {
            String prefix = args[0].toLowerCase(Locale.ROOT);
            for (String s : SUBS) if (s.startsWith(prefix)) out.add(s);
            return out;
        }
        if (args.length == 2) {
            String sub = args[0].toLowerCase(Locale.ROOT);
            String prefix = args[1].toLowerCase(Locale.ROOT);
            if (PLAYER_SUBS.contains(sub)) {
                // /clan invite → every other online player (we filter the
                // sender). /clan kick / promote / demote / transfer →
                // every member of the caller's own clan, excluding the
                // caller themselves.
                java.util.Collection<? extends Player> pool;
                if ("invite".equals(sub)) {
                    pool = Bukkit.getOnlinePlayers();
                } else if (sender instanceof Player p) {
                    Optional<Clan> mine = repo.byPlayer(p.getUniqueId());
                    if (mine.isEmpty()) return out;
                    java.util.Set<UUID> memberUuids = mine.get().members().stream()
                            .map(ClanMember::playerUuid)
                            .collect(java.util.stream.Collectors.toSet());
                    pool = Bukkit.getOnlinePlayers().stream()
                            .filter(pl -> memberUuids.contains(pl.getUniqueId()))
                            .toList();
                } else {
                    return out;
                }
                for (Player pl : pool) {
                    if (sender instanceof Player self && pl.getUniqueId().equals(self.getUniqueId())) {
                        continue;
                    }
                    if (pl.getName().toLowerCase(Locale.ROOT).startsWith(prefix)) {
                        out.add(pl.getName());
                    }
                }
                return out;
            }
            if ("info".equals(sub)) {
                for (Clan c : repo.all()) {
                    if (c.tag().toLowerCase(Locale.ROOT).startsWith(prefix)) out.add(c.tag());
                }
                return out;
            }
            if ("accept".equals(sub) || "decline".equals(sub)) {
                if (sender instanceof Player p) {
                    for (String tag : pending.pendingFor(p.getUniqueId())) {
                        if (tag.toLowerCase(Locale.ROOT).startsWith(prefix)) out.add(tag);
                    }
                }
                return out;
            }
        }
        return out;
    }
}
