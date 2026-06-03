package dev.crestoria.command;

import com.google.gson.Gson;
import dev.crestoria.CrestoriaPlugin;
import dev.crestoria.util.Msg;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;

/**
 * Admin/operator command. Three subcommands:
 *   /clancape setup [serverName] — generate a setup token, POST it to
 *     the panel, print the plaintext to the operator's chat (once).
 *   /clancape link <apiKey> — save the issued API key into config.yml
 *     and refresh all caches.
 *   /clancape reload — re-read config + refresh repos.
 */
public final class ClanCapeCommand implements CommandExecutor {

    private static final SecureRandom RNG = new SecureRandom();
    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    private static final Gson GSON = new Gson();

    private final CrestoriaPlugin plugin;

    public ClanCapeCommand(CrestoriaPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission("clancapes.cape.admin")) {
            sender.sendMessage(Msg.err("You don't have permission to use this command."));
            return true;
        }
        if (args.length == 0) {
            sender.sendMessage(Msg.err("Usage:  /clancape <setup|link|reload|event|debug>"));
            return true;
        }
        String sub = args[0].toLowerCase(java.util.Locale.ROOT);
        return switch (sub) {
            case "setup" -> doSetup(sender, args);
            case "link" -> doLink(sender, args);
            case "reload" -> doReload(sender);
            case "event" -> doEvent(sender, args);
            case "debug" -> doDebug(sender, args);
            default -> {
                sender.sendMessage(Msg.err(
                        "Unknown subcommand — use setup, link, reload, event, or debug."));
                yield true;
            }
        };
    }

    /**
     * Operator-only event harness:
     *   /clancape event start <airdrop|koth|random>
     *   /clancape event stop
     *   /clancape event status
     *   /clancape event reset
     *
     * start bypasses cooldown + threshold guards (forced via
     * EventScheduler.forceStart). stop calls cancel on the active
     * event. reset clears the lastFired map so the next regular
     * tick can fire. status prints active state + per-type cooldown.
     */
    private boolean doEvent(CommandSender sender, String[] args) {
        var sched = plugin.getEventScheduler();
        if (sched == null) {
            sender.sendMessage(Msg.err("The event scheduler isn't ready yet."));
            return true;
        }
        if (args.length < 2) {
            sender.sendMessage(Msg.err(
                    "Usage:  /clancape event <start <airdrop|koth|random>|stop|status|reset>"));
            return true;
        }
        String action = args[1].toLowerCase(java.util.Locale.ROOT);
        switch (action) {
            case "start" -> {
                if (args.length < 3) {
                    sender.sendMessage(Msg.err("Usage:  /clancape event start <airdrop|koth|random>"));
                    return true;
                }
                sender.sendMessage(Msg.okTag("", "event", " " + sched.forceStart(args[2])));
            }
            case "stop" -> sender.sendMessage(Msg.infoTag("", "event", " " + sched.stopActive()));
            case "status" -> {
                String snap = sched.describeStatus();
                for (String line : snap.split("\n")) {
                    sender.sendMessage(Msg.line("  " + line, Msg.MUTE));
                }
            }
            case "reset" -> sender.sendMessage(Msg.infoTag("", "event", " " + sched.clearCooldowns()));
            default -> sender.sendMessage(Msg.err(
                    "Unknown action '" + action + "' — use start, stop, status, or reset."));
        }
        return true;
    }

    /**
     * Toggle the logging.debug flag at runtime and persist it.
     *   /clancape debug on|off|status
     */
    private boolean doDebug(CommandSender sender, String[] args) {
        if (args.length < 2) {
            sender.sendMessage(Msg.err("Usage:  /clancape debug <on|off|status>"));
            return true;
        }
        String mode = args[1].toLowerCase(java.util.Locale.ROOT);
        switch (mode) {
            case "on" -> {
                plugin.getConfig().set("logging.debug", true);
                plugin.saveConfig();
                plugin.reloadFromConfig();
                sender.sendMessage(Msg.okTag("", "debug", " on — verbose logs enabled."));
            }
            case "off" -> {
                plugin.getConfig().set("logging.debug", false);
                plugin.saveConfig();
                plugin.reloadFromConfig();
                sender.sendMessage(Msg.infoTag("", "debug", " off — warnings only."));
            }
            case "status" -> {
                boolean on = plugin.getConfig().getBoolean("logging.debug", false);
                sender.sendMessage(Msg.infoTag("", "debug", " is currently " + (on ? "on" : "off") + "."));
            }
            default -> sender.sendMessage(Msg.err(
                    "Unknown mode '" + mode + "' — use on, off, or status."));
        }
        return true;
    }

    private boolean doSetup(CommandSender sender, String[] args) {
        String panelUrl = plugin.getConfig().getString("panel.url", "").trim();
        if (panelUrl.isEmpty()) {
            sender.sendMessage(Msg.err("Set panel.url in config.yml first."));
            return true;
        }
        String serverName = args.length >= 2
                ? args[1]
                : plugin.getConfig().getString("panel.server-name", "minecraft-server").trim();
        if (serverName.isEmpty()) serverName = "minecraft-server";

        String token = generateSetupToken();
        Map<String, Object> body = Map.of("token", token, "serverName", serverName);
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(stripTrailing(panelUrl) + "/api/setup/register"))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(GSON.toJson(body)))
                .build();

        final String finalServerName = serverName;
        HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                .thenAccept(res -> plugin.getServer().getScheduler().runTask(plugin, () -> {
                    if (res.statusCode() == 200 || res.statusCode() == 201) {
                        plugin.getConfig().set("panel.server-name", finalServerName);
                        plugin.saveConfig();
                        // 1.0.9: do NOT mirror the raw token to the server
                        // console — log files are often forwarded to monitoring
                        // and chat backups, leaking a 15-min credential. The
                        // operator can copy the click-event token from chat;
                        // we only log the metadata.
                        plugin.getLogger().info(
                                "Setup token issued for '" + finalServerName
                                        + "' — paste from in-game chat into /dashboard/servers within 15 min.");
                        // 1.0.10: do not render the raw token as visible
                        // chat text — chat-relay plugins (DiscordSRV, AB
                        // chatlog, …) mirror chat messages off-server and
                        // would replicate the 15-min credential. The
                        // clickable component now shows a placeholder
                        // label; the token lives only in the click-event
                        // payload that the player's client copies locally.
                        sender.sendMessage(Msg.ok(
                                "Setup token ready — click to copy, then paste it into the panel (valid 15 min):"));
                        sender.sendMessage(Component.text("  ", Msg.MUTE).append(
                                Msg.button("Copy setup token",
                                        ClickEvent.copyToClipboard(token),
                                        "Click to copy the token to your clipboard")));
                        sender.sendMessage(Msg.prefix()
                                .append(Component.text("Then click to prefill: ", Msg.INFO))
                                .append(Component.text("/clancape link …", Msg.LINK)
                                        .clickEvent(ClickEvent.suggestCommand("/clancape link "))
                                        .hoverEvent(HoverEvent.showText(Component.text(
                                                "Opens chat prefilled with the link command",
                                                Msg.MUTE)))));
                    } else {
                        sender.sendMessage(Msg.err(
                                "The panel rejected the setup request (HTTP " + res.statusCode()
                                        + ") — check panel.url and try again."));
                    }
                }))
                .exceptionally(t -> {
                    plugin.getServer().getScheduler().runTask(plugin, () ->
                            sender.sendMessage(Msg.err(
                                    "Couldn't reach the panel — check panel.url and the network.")));
                    return null;
                });
        return true;
    }

    private boolean doLink(CommandSender sender, String[] args) {
        if (args.length < 2) {
            sender.sendMessage(Msg.err("Usage:  /clancape link <api-key>"));
            return true;
        }
        String apiKey = args[1].trim();
        if (apiKey.isEmpty()) {
            sender.sendMessage(Msg.err("The key can't be empty — copy it from the panel."));
            return true;
        }
        plugin.getConfig().set("panel.api-key", apiKey);
        plugin.saveConfig();
        plugin.reloadFromConfig();
        sender.sendMessage(Msg.ok("Panel linked — refreshing caches."));
        return true;
    }

    private boolean doReload(CommandSender sender) {
        plugin.reloadConfig();
        plugin.reloadFromConfig();
        sender.sendMessage(Msg.ok(
                "Reloaded config.yml.  (plugin.yml changes still need a server restart.)"));
        return true;
    }

    private static String generateSetupToken() {
        byte[] bytes = new byte[32];
        RNG.nextBytes(bytes);
        String b64 = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        return "setup_" + b64;
    }

    private static String stripTrailing(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
}
