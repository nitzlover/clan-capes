package dev.clancapes.command;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import dev.clancapes.ClanCapesPlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
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

    private final ClanCapesPlugin plugin;

    public ClanCapeCommand(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission("clancapes.cape.admin")) {
            sender.sendMessage(Component.text("No permission.", NamedTextColor.RED));
            return true;
        }
        if (args.length == 0) {
            sender.sendMessage(Component.text("Usage: /clancape <setup|link|reload>", NamedTextColor.RED));
            return true;
        }
        String sub = args[0].toLowerCase();
        return switch (sub) {
            case "setup" -> doSetup(sender, args);
            case "link" -> doLink(sender, args);
            case "reload" -> doReload(sender);
            default -> {
                sender.sendMessage(Component.text("Unknown subcommand. Use setup, link, or reload.",
                        NamedTextColor.RED));
                yield true;
            }
        };
    }

    private boolean doSetup(CommandSender sender, String[] args) {
        String panelUrl = plugin.getConfig().getString("panel.url", "").trim();
        if (panelUrl.isEmpty()) {
            sender.sendMessage(Component.text("Set panel.url in config.yml first.",
                    NamedTextColor.RED));
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
                        sender.sendMessage(Component.text(
                                "Setup token (paste into /dashboard/servers, valid 15 min):",
                                NamedTextColor.GREEN));
                        sender.sendMessage(Component.text(token, NamedTextColor.YELLOW));
                        sender.sendMessage(Component.text(
                                "Then run: /clancape link <api-key-from-panel>",
                                NamedTextColor.GRAY));
                    } else {
                        sender.sendMessage(Component.text(
                                "Panel rejected setup: " + res.statusCode() + " " + res.body(),
                                NamedTextColor.RED));
                    }
                }))
                .exceptionally(t -> {
                    plugin.getServer().getScheduler().runTask(plugin, () ->
                            sender.sendMessage(Component.text(
                                    "Panel unreachable: " + t.getMessage(),
                                    NamedTextColor.RED)));
                    return null;
                });
        return true;
    }

    private boolean doLink(CommandSender sender, String[] args) {
        if (args.length < 2) {
            sender.sendMessage(Component.text("Usage: /clancape link <api-key>", NamedTextColor.RED));
            return true;
        }
        String apiKey = args[1].trim();
        if (apiKey.isEmpty()) {
            sender.sendMessage(Component.text("API key must not be empty.", NamedTextColor.RED));
            return true;
        }
        plugin.getConfig().set("panel.api-key", apiKey);
        plugin.saveConfig();
        plugin.reloadFromConfig();
        sender.sendMessage(Component.text("Panel linked. Caches refreshing.", NamedTextColor.GREEN));
        return true;
    }

    private boolean doReload(CommandSender sender) {
        plugin.reloadConfig();
        plugin.reloadFromConfig();
        sender.sendMessage(Component.text("Plugin reloaded.", NamedTextColor.GREEN));
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

    private JsonObject parseJson(String body) {
        try {
            return GSON.fromJson(body, JsonObject.class);
        } catch (Exception e) {
            return new JsonObject();
        }
    }
}
