package dev.clancapes.hook;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.clan.Clan;
import dev.clancapes.clan.ClanMember;
import dev.clancapes.clan.ClanRepository;
import dev.clancapes.service.CapeService;
import me.clip.placeholderapi.expansion.PlaceholderExpansion;
import org.bukkit.OfflinePlayer;
import org.jetbrains.annotations.NotNull;

import java.util.Optional;

/**
 * PlaceholderAPI expansion — exposes both legacy cape placeholders
 * (cape_url, updated_at) and the Phase 2 clan-system placeholders
 * (tag, name, color, role, members) backed by the panel-driven
 * {@link ClanRepository}.
 *
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
        String key = params.toLowerCase();

        // Cape placeholders (unchanged from Phase 1).
        var dto = capeService.resolvePlayer(player.getUniqueId());
        switch (key) {
            case "has_cape": return String.valueOf(dto.hasCape());
            case "cape_url": return dto.capeUrl() != null ? dto.capeUrl() : "";
            case "updated_at": return String.valueOf(dto.updatedAt());
            default:
                // Fall through to clan placeholders below.
        }

        // Clan placeholders — backed by ClanRepository when configured,
        // otherwise fall back to the legacy capeService cape DTO so
        // %clancapes_clan% keeps returning the PowerClans-resolved tag
        // for servers that haven't migrated yet.
        ClanRepository repo = plugin.getClanRepository();
        Optional<Clan> clanOpt =
                repo != null ? repo.byPlayer(player.getUniqueId()) : Optional.empty();
        Clan clan = clanOpt.orElse(null);

        return switch (key) {
            case "clan", "tag" ->
                    clan != null ? clan.tag() : (dto.clan() != null ? dto.clan() : "");
            case "name" -> clan != null ? clan.name() : "";
            case "color", "colour", "color_hex" ->
                    clan != null ? clan.colorHex() : "";
            case "color_prefix" ->
                    // Convenience: "[TAG] " in the clan's color, formatted
                    // for legacy &-codes so chat plugins that don't speak
                    // Adventure still render it. Falls back to plain "[TAG] "
                    // when no color is set.
                    clan != null
                            ? "§x" + hexLegacy(clan.colorHex()) + "[" + clan.tag() + "]§r "
                            : "";
            case "tag_bracketed" ->
                    // Minimessage-pre-formatted "[TAG] " chunk for chat
                    // plugins that need a single placeholder collapsing
                    // to "" for unclanned players so an empty "[]"
                    // doesn't appear before the player name. Uses the
                    // panel's B&W brutalist style (dark-grey brackets,
                    // white tag) instead of the clan color, matching
                    // the LPC chat-format default.
                    clan != null
                            ? "<dark_gray>[</dark_gray><white>"
                                    + clan.tag()
                                    + "</white><dark_gray>]</dark_gray> "
                            : "";
            case "role" -> roleFor(clan, player);
            case "members" -> clan != null ? String.valueOf(clan.members().size()) : "0";
            case "is_leader" -> String.valueOf(
                    clan != null && clan.leaderUuid().equals(player.getUniqueId()));
            case "is_deputy" -> {
                if (clan == null) yield "false";
                yield clan.members().stream()
                        .anyMatch(m -> m.playerUuid().equals(player.getUniqueId())
                                && m.role() == ClanMember.Role.DEPUTY)
                        ? "true" : "false";
            }
            // Phase-5 stats stubs — return zero today so operator-facing
            // displays (TAB suffix, scoreboard sidebars, chat hooks)
            // can wire `%clancapes_kills%` / `%clancapes_deaths%` /
            // `%clancapes_kd%` in now and pick up real PvP numbers
            // automatically once the kill listener + panel rollup ship.
            case "kills", "deaths" -> "0";
            case "kd", "kdr" -> "0.00";
            default -> null;
        };
    }

    private static String roleFor(Clan clan, OfflinePlayer player) {
        if (clan == null) return "";
        for (ClanMember m : clan.members()) {
            if (m.playerUuid().equals(player.getUniqueId())) {
                return m.role().name().toLowerCase();
            }
        }
        return "";
    }

    /**
     * Convert "#RRGGBB" to Minecraft's legacy hex-color format
     * "§x§R§R§G§G§B§B" without the leading "§x" (callers prefix it).
     */
    private static String hexLegacy(String hex) {
        if (hex == null || hex.length() != 7) return "ffffff";
        StringBuilder b = new StringBuilder();
        for (int i = 1; i < 7; i++) {
            b.append('§').append(hex.charAt(i));
        }
        return b.toString();
    }
}
