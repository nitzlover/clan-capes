package dev.crestoria.listener;

import com.destroystokyo.paper.entity.villager.Reputation;
import com.destroystokyo.paper.entity.villager.ReputationType;
import dev.crestoria.CrestoriaPlugin;
import dev.crestoria.api.dto.ClanDto;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Villager;
import org.bukkit.entity.ZombieVillager;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityTransformEvent;

import java.util.UUID;

/**
 * Clan perk: a zombie-villager cure shares its trade discount with the
 * whole clan, not just the player who cured it.
 *
 * <h2>Vanilla baseline</h2>
 * Minecraft stores per-player "gossip" reputation on each villager.
 * Curing a zombie villager grants the curer a {@code MAJOR_POSITIVE}
 * gossip entry (value 20, capped at 100), which the trade-price math
 * turns into a permanent discount at that specific villager. The
 * gossip is keyed by player UUID and persists whether the player is
 * online or not.
 *
 * <h2>What this listener adds</h2>
 * When a zombie villager finishes converting, we read the curer's
 * {@code MAJOR_POSITIVE} value off the freshly-spawned villager and
 * mirror it onto every member of the curer's clan. The result: the
 * cured villager hands the same discount to the entire clan.
 *
 * <p>Behaviour rules:
 * <ul>
 *   <li>Curer not in a clan → no-op, pure vanilla.</li>
 *   <li>We never lower an existing reputation — each member gets
 *       {@code max(theirCurrent, curerValue)} so a member who already
 *       earned a bigger discount at that villager keeps it.</li>
 *   <li>Value clamped to the vanilla 0..100 range.</li>
 *   <li>Reputation is applied one tick later, after vanilla has
 *       written the curer's own gossip — reading it on the transform
 *       event itself would see an empty map.</li>
 *   <li>Not retroactive: a player who joins the clan after the cure
 *       doesn't get the discount on already-cured villagers.</li>
 * </ul>
 *
 * <p>Gated on {@code clan-perks.shared-cure-discount} in config.yml
 * (default true). When the panel snapshot has no clan for the curer
 * (cache cold / clanless) the listener silently falls back to vanilla.
 */
public final class ClanCureListener implements Listener {

    /** Vanilla cure gossip cap. */
    private static final int MAJOR_POSITIVE_CAP = 100;

    private final CrestoriaPlugin plugin;

    public ClanCureListener(CrestoriaPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onCure(EntityTransformEvent event) {
        if (event.getTransformReason() != EntityTransformEvent.TransformReason.CURED) return;
        if (!plugin.getConfig().getBoolean("clan-perks.shared-cure-discount", true)) return;
        if (!(event.getEntity() instanceof ZombieVillager zombie)) return;
        if (!(event.getTransformedEntity() instanceof Villager villager)) return;

        // Vanilla records the curing player on the zombie villager when
        // the cure starts — no need to track the golden-apple feed
        // ourselves.
        OfflinePlayer curer = zombie.getConversionPlayer();
        if (curer == null) return;
        UUID curerUuid = curer.getUniqueId();

        ClanDto clan = plugin.getClanRepository().getByPlayer(curerUuid).orElse(null);
        if (clan == null || clan.members == null || clan.members.isEmpty()) return;

        // Defer one tick so vanilla's own gossip write to the curer has
        // landed on the new villager before we read + mirror it.
        plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            if (!villager.isValid()) return;
            shareDiscount(villager, curerUuid, clan);
        }, 1L);
    }

    private void shareDiscount(Villager villager, UUID curerUuid, ClanDto clan) {
        Reputation curerRep = villager.getReputation(curerUuid);
        int curerValue = curerRep == null ? 0
                : curerRep.getReputation(ReputationType.MAJOR_POSITIVE);
        if (curerValue <= 0) {
            // Vanilla didn't grant the expected cure gossip (config /
            // datapack override?). Fall back to the vanilla cure value
            // so the clan still gets a discount.
            curerValue = 20;
        }
        int value = Math.min(curerValue, MAJOR_POSITIVE_CAP);

        int applied = 0;
        for (var member : clan.members) {
            if (member.playerUuid == null) continue;
            UUID memberUuid;
            try {
                memberUuid = UUID.fromString(member.playerUuid);
            } catch (IllegalArgumentException bad) {
                continue;
            }
            if (memberUuid.equals(curerUuid)) continue; // curer already has it

            Reputation rep = villager.getReputation(memberUuid);
            if (rep == null) rep = new Reputation();
            int current = rep.getReputation(ReputationType.MAJOR_POSITIVE);
            if (current >= value) continue; // member already has an equal/better discount
            rep.setReputation(ReputationType.MAJOR_POSITIVE, value);
            villager.setReputation(memberUuid, rep);
            applied++;
        }

        final int sharedWith = applied;
        plugin.debugLog(() -> "[cure] clan [" + clan.tag + "] shared cure discount ("
                + value + " MAJOR_POSITIVE) with " + sharedWith + " member(s)");
    }
}
