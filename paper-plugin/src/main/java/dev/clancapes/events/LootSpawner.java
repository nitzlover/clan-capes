package dev.clancapes.events;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.block.Chest;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;

import java.util.List;
import java.util.Random;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Spawns the airdrop loot chest at the chosen drop point and fills
 * it with a curated reward set.
 *
 * <p>Phase 5.3 uses a hand-rolled loot list (gear + consumables)
 * rather than a vanilla loot table — keeps the reward predictable
 * and avoids wiring a datapack. A future pass can swap in a
 * configurable loot pool via {@code config.payload.lootPool}.
 *
 * <p>The chest is placed on the surface at the drop column so the
 * winning clan can find + open it during the collection window.
 */
public final class LootSpawner {

    /** Curated reward pool: (material, min, max, weight). */
    private record Reward(Material material, int min, int max, int weight) {}

    private static final List<Reward> POOL = List.of(
            new Reward(Material.DIAMOND, 2, 6, 10),
            new Reward(Material.DIAMOND_BLOCK, 1, 2, 4),
            new Reward(Material.NETHERITE_SCRAP, 1, 2, 3),
            new Reward(Material.GOLDEN_APPLE, 2, 5, 8),
            new Reward(Material.ENCHANTED_GOLDEN_APPLE, 1, 1, 2),
            new Reward(Material.EXPERIENCE_BOTTLE, 8, 16, 8),
            new Reward(Material.ENDER_PEARL, 4, 8, 6),
            new Reward(Material.TOTEM_OF_UNDYING, 1, 1, 3),
            new Reward(Material.NETHERITE_INGOT, 1, 2, 3),
            new Reward(Material.GOLDEN_CARROT, 16, 32, 6)
    );

    private static final int TOTAL_WEIGHT = POOL.stream().mapToInt(Reward::weight).sum();

    private LootSpawner() {}

    /**
     * Places a loot chest at {@code where} (snapped to the surface)
     * and fills it with 5–9 random stacks from the pool.
     *
     * @return the chest block's location for the chat coordinate
     *   callout, or null if placement failed.
     */
    public static Location spawn(World world, int x, int z) {
        int y = world.getHighestBlockYAt(x, z) + 1;
        Block block = world.getBlockAt(x, y, z);
        block.setType(Material.CHEST);
        if (!(block.getState() instanceof Chest chest)) {
            return null;
        }
        Inventory inv = chest.getBlockInventory();
        Random rng = ThreadLocalRandom.current();
        int stacks = 5 + rng.nextInt(5); // 5..9
        for (int i = 0; i < stacks; i++) {
            Reward r = pickWeighted(rng);
            int amount = r.min + (r.max > r.min ? rng.nextInt(r.max - r.min + 1) : 0);
            int slot = rng.nextInt(inv.getSize());
            inv.setItem(slot, new ItemStack(r.material, amount));
        }
        return block.getLocation();
    }

    private static Reward pickWeighted(Random rng) {
        int roll = rng.nextInt(TOTAL_WEIGHT);
        int acc = 0;
        for (Reward r : POOL) {
            acc += r.weight();
            if (roll < acc) return r;
        }
        return POOL.get(0);
    }
}
