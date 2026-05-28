package dev.clancapes.listener;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.api.dto.ClanDto;
import org.bukkit.entity.Player;
import org.bukkit.entity.Projectile;
import org.bukkit.entity.Entity;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.projectiles.ProjectileSource;

import java.util.Optional;
import java.util.UUID;

/**
 * Cancels intra-clan PvP damage when the victim's clan has the
 * {@code friendlyFire} flag set to {@code false}.
 *
 * <p>Triggers on {@link EntityDamageByEntityEvent}, resolves the
 * effective attacker through any projectile chain (so an arrow,
 * trident, or fishing rod hook attributes back to the shooter),
 * then checks whether both attacker and victim are members of the
 * same clan AND that clan opted out of friendly fire.
 *
 * <p>Listening at {@link EventPriority#HIGH} but not {@code HIGHEST}
 * — leaves room for a final-veto plugin (e.g. WorldGuard region
 * flag) to override. {@code ignoreCancelled = true} so this never
 * un-cancels another plugin's prior decision.
 *
 * <p>Missing clan data, missing friendlyFire flag, or any non-player
 * pair → no-op. Mob → mob damage is filtered out by the player-cast
 * guards up front.
 */
public final class FriendlyFireListener implements Listener {

    private final ClanCapesPlugin plugin;

    public FriendlyFireListener(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onDamage(EntityDamageByEntityEvent event) {
        Player victim = playerOf(event.getEntity());
        if (victim == null) return;
        Player attacker = effectiveAttacker(event.getDamager());
        if (attacker == null) return;
        if (attacker.getUniqueId().equals(victim.getUniqueId())) return; // self damage

        UUID victimUuid = victim.getUniqueId();
        UUID attackerUuid = attacker.getUniqueId();

        Optional<ClanDto> victimClan = plugin.getClanRepository().getByPlayer(victimUuid);
        if (victimClan.isEmpty() || victimClan.get().friendlyFire == null) return;
        // Default-true semantics: if the flag is explicitly false AND
        // both sides share this clan, cancel the swing.
        if (Boolean.TRUE.equals(victimClan.get().friendlyFire)) return;

        Optional<ClanDto> attackerClan = plugin.getClanRepository().getByPlayer(attackerUuid);
        if (attackerClan.isEmpty()) return;
        if (victimClan.get().id != attackerClan.get().id) return;

        event.setCancelled(true);
    }

    private static Player playerOf(Entity e) {
        return e instanceof Player p ? p : null;
    }

    /**
     * Walks through a projectile's shooter so an arrow / trident /
     * snowball / fishing-rod hook attributes back to the player who
     * fired it. Non-player shooters (dispensers, skeletons) return
     * null — those aren't intra-clan friendly fire by definition.
     */
    private static Player effectiveAttacker(Entity damager) {
        if (damager instanceof Player p) return p;
        if (damager instanceof Projectile projectile) {
            ProjectileSource source = projectile.getShooter();
            if (source instanceof Player p) return p;
        }
        return null;
    }
}
