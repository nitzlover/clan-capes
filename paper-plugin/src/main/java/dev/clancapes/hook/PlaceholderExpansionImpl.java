package dev.clancapes.hook;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.service.CapeService;
import me.clip.placeholderapi.expansion.PlaceholderExpansion;
import org.bukkit.OfflinePlayer;
import org.jetbrains.annotations.NotNull;

/**
 * Loaded only when PlaceholderAPI is on the server classpath at runtime.
 */
public final class PlaceholderExpansionImpl extends PlaceholderExpansion {
    private final ClanCapesPlugin plugin;
    private final CapeService capeService;

    public PlaceholderExpansionImpl(ClanCapesPlugin plugin, CapeService capeService) {
        this.plugin = plugin;
        this.capeService = capeService;
    }

    @Override
    public @NotNull String getIdentifier() {
        return "clancapes";
    }

    @Override
    public @NotNull String getAuthor() {
        return "ClanCapes";
    }

    @Override
    public @NotNull String getVersion() {
        return plugin.getDescription().getVersion();
    }

    @Override
    public boolean persist() {
        return true;
    }

    @Override
    public String onRequest(OfflinePlayer player, @NotNull String params) {
        if (player == null) {
            return "";
        }
        var dto = capeService.resolvePlayer(player.getUniqueId());
        return switch (params.toLowerCase()) {
            case "has_cape" -> String.valueOf(dto.hasCape());
            case "cape_url" -> dto.capeUrl() != null ? dto.capeUrl() : "";
            case "clan" -> dto.clan() != null ? dto.clan() : "";
            case "updated_at" -> String.valueOf(dto.updatedAt());
            default -> null;
        };
    }
}
