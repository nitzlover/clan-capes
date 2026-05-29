package dev.clancapes.listener;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.api.dto.ClanDto;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reports PvP kills to the panel. Only fires when the killer is
 * another player (entity → player or self-death is ignored). Clan
 * tags are looked up locally so the death message can be prefixed
 * before the panel call lands.
 */
public final class PlayerDeathListener implements Listener {

    private final ClanCapesPlugin plugin;

    public PlayerDeathListener(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onDeath(PlayerDeathEvent event) {
        Player victim = event.getEntity();
        Player killer = victim.getKiller();
        if (killer == null || killer.getUniqueId().equals(victim.getUniqueId())) {
            return;
        }
        if (!plugin.getPanelClient().isConfigured()) {
            return;
        }

        UUID killerUuid = killer.getUniqueId();
        UUID victimUuid = victim.getUniqueId();

        // Decorate the vanilla death message with clan tags so chat
        // shows "[KING] Alice slain by [WOLF] Bob".
        ClanDto killerClan = plugin.getClanRepository().getByPlayer(killerUuid).orElse(null);
        ClanDto victimClan = plugin.getClanRepository().getByPlayer(victimUuid).orElse(null);
        if (killerClan != null || victimClan != null) {
            String base = event.deathMessage() != null
                    ? net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer
                            .plainText().serialize(event.deathMessage())
                    : (victim.getName() + " was slain by " + killer.getName());
            String decorated = decorate(base, killerClan, victimClan, killer.getName(), victim.getName());
            event.deathMessage(net.kyori.adventure.text.Component.text(decorated));
        }

        plugin.getPanelClient().postKill(killerUuid, victimUuid)
                .exceptionally(t -> {
                    plugin.getLogger().warning("[kill] post failed: " + t.getMessage());
                    return null;
                });
    }

    /**
     * Prefix clan tags onto the player names inside the vanilla death
     * message.
     *
     * <p>Done as a single whole-word pass over the original string so
     * that:
     * <ul>
     *   <li>a name that's a substring of the other (e.g. "Stev" vs
     *       "Steve") can't be replaced inside the longer one — the
     *       {@code \b} word boundaries require a full-token match;</li>
     *   <li>an inserted "[TAG] name" is never re-scanned, so the
     *       killer pass can't match the victim name we just injected
     *       (the old two-pass {@code String.replace} corrupted these).</li>
     * </ul>
     * Names are matched longest-first so the alternation prefers the
     * more specific token when one contains the other.
     */
    private static String decorate(String base, ClanDto killerClan, ClanDto victimClan,
                                   String killerName, String victimName) {
        Map<String, String> repl = new LinkedHashMap<>();
        if (victimClan != null && victimClan.tag != null) {
            repl.put(victimName, "[" + victimClan.tag + "] " + victimName);
        }
        if (killerClan != null && killerClan.tag != null) {
            repl.put(killerName, "[" + killerClan.tag + "] " + killerName);
        }
        if (repl.isEmpty()) return base;

        // Longest name first so "Steve" wins over "Stev" in the
        // alternation when both could match at a position.
        List<String> names = new ArrayList<>(repl.keySet());
        names.sort((a, b) -> b.length() - a.length());

        StringBuilder alt = new StringBuilder();
        for (String n : names) {
            if (alt.length() > 0) alt.append('|');
            alt.append(Pattern.quote(n));
        }
        Pattern p = Pattern.compile("\\b(?:" + alt + ")\\b");
        Matcher m = p.matcher(base);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            String hit = m.group();
            m.appendReplacement(out, Matcher.quoteReplacement(repl.getOrDefault(hit, hit)));
        }
        m.appendTail(out);
        return out.toString();
    }
}
