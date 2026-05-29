package dev.clancapes.listener;

import dev.clancapes.events.EventBoundary;
import org.bukkit.entity.EnderPearl;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.ProjectileLaunchEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.projectiles.ProjectileSource;

import java.util.UUID;

/**
 * Enforces a sealed event zone boundary (events.txt: a wall a player
 * can't walk through, pearl through, or build blocks into once the
 * zone is closed by event stage).
 *
 * <p>All three handlers are no-ops unless {@link EventBoundary} has a
 * sealed zone registered, so the listener is registered once at
 * plugin enable and costs a single volatile read per event when no
 * event is sealed. Enrolled participants (the {@code allowed} set)
 * are exempt — only outsiders are stopped.
 */
public final class BoundaryListener implements Listener {

    /**
     * Block outsiders walking INTO a sealed zone. Movement entirely
     * inside or entirely outside is untouched; only the
     * outside→inside crossing of a non-participant is cancelled. The
     * `hasChangedBlock` guard skips the per-tick look/again spam so
     * this only fires on real position changes.
     */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onMove(PlayerMoveEvent event) {
        if (!EventBoundary.isSealed()) return;
        if (event.getTo() == null) return;
        // Only care when the destination block differs from the origin.
        if (event.getFrom().getBlockX() == event.getTo().getBlockX()
                && event.getFrom().getBlockZ() == event.getTo().getBlockZ()) {
            return;
        }
        Player p = event.getPlayer();
        if (EventBoundary.isAllowed(p.getUniqueId())) return;
        boolean fromInside = EventBoundary.contains(event.getFrom());
        boolean toInside = EventBoundary.contains(event.getTo());
        if (!fromInside && toInside) {
            // Outsider trying to step in — hold them at the wall.
            event.setCancelled(true);
        }
    }

    /**
     * Stop an outsider pearling into a sealed zone. We cancel an
     * ender pearl thrown by a non-participant who is currently
     * outside the zone — that's the "pearl through the wall" exploit.
     * Pearls thrown by participants, or from inside, are left alone.
     */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onProjectile(ProjectileLaunchEvent event) {
        if (!EventBoundary.isSealed()) return;
        if (!(event.getEntity() instanceof EnderPearl pearl)) return;
        ProjectileSource src = pearl.getShooter();
        if (!(src instanceof Player p)) return;
        UUID id = p.getUniqueId();
        if (EventBoundary.isAllowed(id)) return;
        // Outsider (non-participant) standing outside the zone can't
        // lob a pearl past the wall.
        if (!EventBoundary.contains(p.getLocation())) {
            event.setCancelled(true);
        }
    }

    /**
     * Stop an outsider bridging blocks into a sealed zone (placing a
     * block whose position is inside the boundary). Participants build
     * freely; placements outside the zone are untouched.
     */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onBlockPlace(BlockPlaceEvent event) {
        if (!EventBoundary.isSealed()) return;
        Player p = event.getPlayer();
        if (EventBoundary.isAllowed(p.getUniqueId())) return;
        if (EventBoundary.contains(event.getBlock().getLocation())) {
            event.setCancelled(true);
        }
    }
}
