package dev.clancapes.command;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.config.PluginConfig;
import dev.clancapes.hook.PowerClansHook;
import dev.clancapes.service.CapeService;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Top-level command {@code /clancape [set <url>|remove|reload]}.
 * Renamed from {@code /clan cape ...} so it does not collide with PowerClans' {@code /clan} command.
 */
public final class ClanCapeCommand implements CommandExecutor, TabCompleter {
    private final ClanCapesPlugin plugin;
    private final CapeService capeService;
    private final PowerClansHook powerClansHook;
    private final PluginConfig config;

    public ClanCapeCommand(ClanCapesPlugin plugin, CapeService capeService, PowerClansHook powerClansHook) {
        this.plugin = plugin;
        this.capeService = capeService;
        this.powerClansHook = powerClansHook;
        this.config = plugin.getPluginConfig();
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command, @NotNull String label, @NotNull String[] args) {
        if (args.length == 0) {
            return showCurrent(sender);
        }

        String sub = args[0].toLowerCase();
        return switch (sub) {
            case "set" -> handleSet(sender, args);
            case "remove", "delete" -> handleRemove(sender);
            case "reload" -> handleReload(sender);
            case "info", "show" -> showCurrent(sender);
            default -> {
                sender.sendMessage(config.prefix() + "Usage: /clancape [set <url>|remove|reload]");
                yield true;
            }
        };
    }

    private boolean showCurrent(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only");
            return true;
        }
        if (!sender.hasPermission("clan.cape")) {
            sender.sendMessage(config.msg("no-permission"));
            return true;
        }
        Optional<String> clan = powerClansHook.getClanTag(player);
        if (clan.isEmpty()) {
            sender.sendMessage(config.msg("no-clan"));
            return true;
        }
        capeService.getClanCape(clan.get()).ifPresentOrElse(
                r -> sender.sendMessage(config.prefix() + "Cape: " + r.capeUrl()),
                () -> sender.sendMessage(config.prefix() + "No clan cape set.")
        );
        return true;
    }

    private boolean handleSet(CommandSender sender, String[] args) {
        if (!sender.hasPermission("clan.cape") && !sender.hasPermission("clan.cape.admin")) {
            sender.sendMessage(config.msg("no-permission"));
            return true;
        }
        if (args.length < 2) {
            sender.sendMessage(config.prefix() + "Usage: /clancape set <url>");
            return true;
        }
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only");
            return true;
        }
        Optional<String> clan = powerClansHook.getClanTag(player);
        if (clan.isEmpty()) {
            sender.sendMessage(config.msg("no-clan"));
            return true;
        }
        String url = args[1];
        try {
            capeService.setCapeUrl(clan.get(), url, player.getName());
            sender.sendMessage(config.msg("cape-set"));
        } catch (Exception e) {
            sender.sendMessage(config.msg("invalid-url"));
        }
        return true;
    }

    private boolean handleRemove(CommandSender sender) {
        if (!sender.hasPermission("clan.cape")) {
            sender.sendMessage(config.msg("no-permission"));
            return true;
        }
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Players only");
            return true;
        }
        Optional<String> clan = powerClansHook.getClanTag(player);
        if (clan.isEmpty()) {
            sender.sendMessage(config.msg("no-clan"));
            return true;
        }
        capeService.removeCape(clan.get(), player.getName());
        sender.sendMessage(config.msg("cape-removed"));
        return true;
    }

    private boolean handleReload(CommandSender sender) {
        if (!sender.hasPermission("clan.cape.admin")) {
            sender.sendMessage(config.msg("no-permission"));
            return true;
        }
        plugin.reloadConfig();
        capeService.reloadCache();
        sender.sendMessage(config.msg("cape-reloaded"));
        return true;
    }

    @Override
    public @Nullable List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command, @NotNull String alias, @NotNull String[] args) {
        List<String> out = new ArrayList<>();
        if (args.length == 1) {
            for (String s : List.of("set", "remove", "reload", "info")) {
                if (s.startsWith(args[0].toLowerCase())) {
                    out.add(s);
                }
            }
        }
        return out;
    }
}
