package dev.clancapes.command;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.config.PluginConfig;
import dev.clancapes.hook.PowerClansHook;
import dev.clancapes.panel.PanelClient;
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
import java.util.logging.Level;

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
            case "setup" -> handleSetup(sender, args);
            case "link" -> handleLink(sender, args);
            default -> {
                sender.sendMessage(config.prefix() + "Usage: /clancape [set <url>|remove|reload|setup|link]");
                yield true;
            }
        };
    }

    /**
     * One-time-pass token issue. OP-only. Generates a fresh
     * {@code setup_<…>} token locally, POSTs it to the panel so the
     * panel knows to expect it, and prints the plaintext to chat
     * exactly once. The operator then pastes it into the panel's
     * Register Server modal within 15 minutes.
     */
    private boolean handleSetup(CommandSender sender, String[] args) {
        if (!sender.hasPermission("clan.cape.setup")) {
            sender.sendMessage(config.msg("no-permission"));
            return true;
        }
        String panelUrl = config.getPanelUrl();
        if (panelUrl == null || panelUrl.isBlank()) {
            sender.sendMessage(config.prefix() + "§cSet `panel.url` in config.yml before running setup.");
            return true;
        }

        String serverName = args.length >= 2 ? args[1] : config.getPanelServerName();
        if (serverName == null || serverName.isBlank()) {
            sender.sendMessage(config.prefix() + "§cPass a server name: /clancape setup <name>");
            return true;
        }

        String token = PanelClient.generateSetupToken();
        // Generation + transport happen on a worker thread so the
        // server isn't blocked on the panel's HTTP round-trip.
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                var client = new PanelClient(plugin);
                var res = client.registerSetupToken(panelUrl, token, serverName);
                long minutes = Math.max(1, res.ttlSeconds / 60);
                // Back on the main thread for chat output.
                plugin.getServer().getScheduler().runTask(plugin, () -> {
                    sender.sendMessage(config.prefix() + "§aSetup token issued. Paste it into the panel within "
                            + minutes + " min:");
                    sender.sendMessage("§f" + token);
                    sender.sendMessage(config.prefix() + "§7After consuming, run §f/clancape link <ck_live_…>");
                });
            } catch (PanelClient.PanelException e) {
                plugin.getServer().getScheduler().runTask(plugin, () ->
                        sender.sendMessage(config.prefix() + "§cSetup failed: " + e.getMessage()));
                plugin.getLogger().log(Level.WARNING, "Setup token registration failed", e);
            }
        });
        return true;
    }

    /**
     * Persist the panel-issued API key into config.yml. OP-only.
     * Reloads the in-memory config after writing so subsequent panel
     * calls immediately use the new key.
     */
    private boolean handleLink(CommandSender sender, String[] args) {
        if (!sender.hasPermission("clan.cape.setup")) {
            sender.sendMessage(config.msg("no-permission"));
            return true;
        }
        if (args.length < 2) {
            sender.sendMessage(config.prefix() + "§eUsage: /clancape link <ck_live_…>");
            return true;
        }
        String apiKey = args[1].trim();
        if (!apiKey.startsWith("ck_live_") || apiKey.length() != "ck_live_".length() + 43) {
            sender.sendMessage(config.prefix() + "§cKey must look like ck_live_<43 chars>.");
            return true;
        }
        plugin.getConfig().set("panel.api-key", apiKey);
        plugin.saveConfig();
        plugin.reloadConfig();
        sender.sendMessage(config.prefix() + "§aPanel API key saved. Panel sync ready.");
        return true;
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
            for (String s : List.of("set", "remove", "reload", "info", "setup", "link")) {
                if (s.startsWith(args[0].toLowerCase())) {
                    out.add(s);
                }
            }
        }
        return out;
    }
}
