package dev.clancapes.listener;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.api.dto.ClanDto;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;

import java.util.UUID;

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

    private static String decorate(String base, ClanDto killerClan, ClanDto victimClan,
                                   String killerName, String victimName) {
        String result = base;
        if (victimClan != null) {
            result = result.replace(victimName, "[" + victimClan.tag + "] " + victimName);
        }
        if (killerClan != null) {
            result = result.replace(killerName, "[" + killerClan.tag + "] " + killerName);
        }
        return result;
    }
}
