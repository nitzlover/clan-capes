package dev.clancapes.placeholder;

import com.google.gson.JsonObject;
import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.api.dto.ClanDto;
import dev.clancapes.api.dto.TrimDto;
import me.clip.placeholderapi.expansion.PlaceholderExpansion;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * PlaceholderAPI integration.
 *
 * <p>Placeholders:
 * <ul>
 *   <li>{@code %clancapes_clan_tag%} — clan tag or empty</li>
 *   <li>{@code %clancapes_clan_name%} — clan display name</li>
 *   <li>{@code %clancapes_clan_color_hex%} — clan color hex string</li>
 *   <li>{@code %clancapes_clan_role%} — leader/deputy/member</li>
 *   <li>{@code %clancapes_clan_size%} — member count</li>
 *   <li>{@code %clancapes_online_ratio%} — "3/12" online of total</li>
 *   <li>{@code %clancapes_kd_season%} — season K/D ratio</li>
 *   <li>{@code %clancapes_kd_lifetime%} — lifetime K/D ratio (cached, async)</li>
 *   <li>{@code %clancapes_trim_<slot>_material%} — head/chest/legs/feet</li>
 *   <li>{@code %clancapes_trim_<slot>_pattern%}</li>
 * </ul>
 */
public final class ClanCapesExpansion extends PlaceholderExpansion {

    private final ClanCapesPlugin plugin;
    private final Map<UUID, double[]> lifetimeKdCache = new ConcurrentHashMap<>();

    public ClanCapesExpansion(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public String getIdentifier() {
        return "clancapes";
    }

    @Override
    public String getAuthor() {
        return "ClanCapes";
    }

    @Override
    public String getVersion() {
        return plugin.getDescription().getVersion();
    }

    @Override
    public boolean persist() {
        return true;
    }

    @Override
    public String onRequest(OfflinePlayer player, String params) {
        if (player == null || params == null) return "";
        UUID uuid = player.getUniqueId();
        Optional<ClanDto> clanOpt = plugin.getClanRepository().getByPlayer(uuid);
        String key = params.toLowerCase(Locale.ROOT);

        // Trim placeholders are slot-prefixed.
        if (key.startsWith("trim_")) {
            return trimValue(clanOpt.orElse(null), key);
        }

        return switch (key) {
            case "clan_tag" -> clanOpt.map(c -> c.tag == null ? "" : c.tag).orElse("");
            case "clan_name" -> clanOpt.map(c -> c.name == null ? "" : c.name).orElse("");
            case "clan_color_hex" -> clanOpt.map(c -> c.colorHex == null ? "" : c.colorHex).orElse("");
            case "clan_role" -> plugin.getClanRepository().getRole(uuid).orElse("");
            case "clan_size" -> clanOpt
                    .map(c -> c.members == null ? "0" : String.valueOf(c.members.size()))
                    .orElse("0");
            case "online_ratio" -> onlineRatio(clanOpt.orElse(null));
            case "kd_season" -> clanOpt
                    .map(c -> c.stats == null ? "0.00"
                            : String.format(Locale.ROOT, "%.2f", c.stats.kd))
                    .orElse("0.00");
            case "kd_lifetime" -> kdLifetime(uuid);
            default -> "";
        };
    }

    private String trimValue(ClanDto clan, String key) {
        // key looks like "trim_<slot>_<material|pattern>"
        String[] parts = key.split("_", 3);
        if (parts.length != 3) return "";
        String slot = parts[1];
        String field = parts[2];
        if (clan == null || clan.tag == null) return "";
        TrimDto trim = plugin.getArmorTrimRepository().get(clan.tag, slot).orElse(null);
        if (trim == null) return "";
        return switch (field) {
            case "material" -> trim.material == null ? "" : trim.material;
            case "pattern" -> trim.pattern == null ? "" : trim.pattern;
            default -> "";
        };
    }

    private String onlineRatio(ClanDto clan) {
        if (clan == null || clan.members == null) return "0/0";
        int online = 0;
        for (var m : clan.members) {
            if (m.playerUuid == null) continue;
            try {
                UUID u = UUID.fromString(m.playerUuid);
                Player p = Bukkit.getPlayer(u);
                if (p != null && p.isOnline()) online++;
            } catch (IllegalArgumentException ignore) {
            }
        }
        return online + "/" + clan.members.size();
    }

    /**
     * Lifetime K/D is per-player, not per-clan, so we fetch lazily and
     * cache. Returns the last known value while a refresh is in flight.
     */
    private String kdLifetime(UUID uuid) {
        double[] cached = lifetimeKdCache.get(uuid);
        // Fire-and-forget refresh; PAPI is a sync call, so we can't await.
        if (plugin.getPanelClient().isConfigured() && cached == null) {
            plugin.getPanelClient().getPlayerStats(uuid)
                    .thenAccept((JsonObject json) -> {
                        if (json == null || !json.has("stats")) return;
                        JsonObject stats = json.getAsJsonObject("stats");
                        int kills = stats.has("kills") ? stats.get("kills").getAsInt() : 0;
                        int deaths = stats.has("deaths") ? stats.get("deaths").getAsInt() : 0;
                        double kd = deaths == 0 ? kills : (double) kills / deaths;
                        lifetimeKdCache.put(uuid, new double[]{kills, deaths, kd});
                    })
                    .exceptionally(t -> null);
        }
        if (cached == null) return "0.00";
        return String.format(Locale.ROOT, "%.2f", cached[2]);
    }
}
