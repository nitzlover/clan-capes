package dev.crestoria.events;

import org.bukkit.Bukkit;
import org.bukkit.Color;
import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.entity.Player;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;

/**
 * Particle wall renderer for the event zone boundary.
 *
 * <p>Spawns coloured dust particles along the zone's surface-height
 * boundary every render tick. Only players within {@code
 * VIEW_DISTANCE_BLOCKS} of the zone centre receive the spawn call so
 * far-away clients don't pay for particles they can't see.
 *
 * <p>Resolution is intentionally low (default 96 samples ≈ a
 * particle every ~20 blocks on a 300-block radius) — denser walls
 * pile up packet load for marginal visual gain.
 */
public final class BarrierRenderer {

    private static final int DEFAULT_SAMPLES = 96;
    private static final int RENDER_TICK_INTERVAL = 10;   // half a second
    private static final int VIEW_DISTANCE_BLOCKS = 400;
    private static final double VIEW_DISTANCE_SQ =
            (double) VIEW_DISTANCE_BLOCKS * VIEW_DISTANCE_BLOCKS;

    private final JavaPlugin plugin;
    private final Zone zone;
    private final Color color;
    private final int samples;
    private BukkitTask task;
    private List<Location> cachedPoints;

    public BarrierRenderer(JavaPlugin plugin, Zone zone, Color color) {
        this(plugin, zone, color, DEFAULT_SAMPLES);
    }

    public BarrierRenderer(JavaPlugin plugin, Zone zone, Color color, int samples) {
        this.plugin = plugin;
        this.zone = zone;
        this.color = color;
        this.samples = samples;
    }

    public synchronized void start() {
        if (task != null) return;
        cachedPoints = zone.boundaryPoints(samples);
        task = Bukkit.getScheduler().runTaskTimer(plugin, this::tick,
                0L, RENDER_TICK_INTERVAL);
    }

    public synchronized void stop() {
        if (task != null) {
            task.cancel();
            task = null;
        }
        cachedPoints = null;
    }

    private void tick() {
        if (cachedPoints == null) return;
        Particle.DustOptions dust = new Particle.DustOptions(color, 1.5f);
        for (Player p : zone.world().getPlayers()) {
            double dx = p.getLocation().getX() - zone.centerX();
            double dz = p.getLocation().getZ() - zone.centerZ();
            if (dx * dx + dz * dz > VIEW_DISTANCE_SQ) continue;
            for (Location pt : cachedPoints) {
                p.spawnParticle(Particle.DUST, pt, 1, 0, 0, 0, 0, dust);
            }
        }
    }
}
