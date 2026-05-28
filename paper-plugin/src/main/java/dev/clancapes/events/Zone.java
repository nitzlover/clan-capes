package dev.clancapes.events;

import org.bukkit.Location;
import org.bukkit.World;

import java.util.ArrayList;
import java.util.List;

/**
 * Circular event boundary on the XZ plane. Y is intentionally
 * ignored — events span the full vertical column so a player can't
 * dig under or fly over the boundary and dodge it.
 *
 * <p>{@link #contains(Location)} is the cheap O(1) check used by
 * the move / projectile / block listeners every tick. {@link
 * #boundaryPoints(int)} samples points around the circumference for
 * the particle renderer; the resolution param trades visual density
 * against tick budget.
 */
public final class Zone {

    private final World world;
    private final int centerX;
    private final int centerZ;
    private final int radius;
    /** Cached squared radius for distance comparisons. */
    private final long radiusSq;

    public Zone(World world, int centerX, int centerZ, int radius) {
        if (world == null) throw new IllegalArgumentException("world required");
        if (radius < 1) throw new IllegalArgumentException("radius must be positive");
        this.world = world;
        this.centerX = centerX;
        this.centerZ = centerZ;
        this.radius = radius;
        this.radiusSq = (long) radius * radius;
    }

    public World world() { return world; }
    public int centerX() { return centerX; }
    public int centerZ() { return centerZ; }
    public int radius() { return radius; }

    /**
     * @return {@code true} if {@code loc} is inside the zone (same
     *   world AND within the radius on the XZ plane). Y is ignored.
     */
    public boolean contains(Location loc) {
        if (loc == null) return false;
        if (loc.getWorld() == null || !loc.getWorld().getUID().equals(world.getUID())) {
            return false;
        }
        double dx = loc.getX() - centerX;
        double dz = loc.getZ() - centerZ;
        return dx * dx + dz * dz <= radiusSq;
    }

    /**
     * Samples evenly-spaced points on the boundary at the surface
     * height for particle rendering. {@code samples} drives density:
     * 64 is a thin outline at radius 300, 256 a denser ring.
     */
    public List<Location> boundaryPoints(int samples) {
        if (samples < 4) samples = 4;
        List<Location> out = new ArrayList<>(samples);
        double step = (Math.PI * 2.0) / samples;
        for (int i = 0; i < samples; i++) {
            double angle = step * i;
            double x = centerX + Math.cos(angle) * radius;
            double z = centerZ + Math.sin(angle) * radius;
            // Surface height at the sample column. Cheap-ish call;
            // we cache the result of boundaryPoints between ticks
            // upstream so this fires once per zone, not every tick.
            int y = world.getHighestBlockYAt((int) x, (int) z) + 1;
            out.add(new Location(world, x, y, z));
        }
        return out;
    }
}
