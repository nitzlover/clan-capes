package dev.clancapes.listener;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.clan.ArmorTrimRepository;
import dev.clancapes.clan.Clan;
import dev.clancapes.clan.ClanRepository;
import org.bukkit.Bukkit;
import org.bukkit.NamespacedKey;
import org.bukkit.Registry;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ArmorMeta;
import org.bukkit.inventory.meta.trim.ArmorTrim;
import org.bukkit.inventory.meta.trim.TrimMaterial;
import org.bukkit.inventory.meta.trim.TrimPattern;

import com.destroystokyo.paper.event.player.PlayerArmorChangeEvent;

import java.util.Optional;

/**
 * Stamps the clan's registered armour trim onto a piece of armour the
 * moment a clan member equips it.
 *
 * <p>Listens to Paper's {@link PlayerArmorChangeEvent}, which fires
 * for every helmet / chestplate / leggings / boots add or remove
 * regardless of the source (inventory drag, hotbar swap, dispenser).
 * On equip we look up:
 *
 * <ol>
 *   <li>The player's clan via {@link ClanRepository}.</li>
 *   <li>The clan's trim spec for the slot via
 *       {@link ArmorTrimRepository}.</li>
 *   <li>The vanilla {@link TrimMaterial} + {@link TrimPattern} from
 *       Bukkit's registry. If either is missing (server version that
 *       doesn't ship that pattern) we bail rather than crash.</li>
 * </ol>
 *
 * <p>Application uses {@link ArmorMeta#setTrim(ArmorTrim)}, which is
 * a no-op for non-armour items and preserves every other field on the
 * item meta (enchantments, custom name, lore, durability). The shield
 * banner listener uses the same pattern.
 */
public final class ArmorTrimListener implements Listener {
    private final ClanCapesPlugin plugin;

    public ArmorTrimListener(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onArmorChange(PlayerArmorChangeEvent event) {
        ItemStack equipped = event.getNewItem();
        if (equipped == null || equipped.getType().isAir()) return;

        ArmorTrimRepository.Slot slot = mapSlot(event.getSlotType());
        if (slot == null) return;

        Player player = event.getPlayer();
        ClanRepository clanRepo = plugin.getClanRepository();
        ArmorTrimRepository trimRepo = plugin.getArmorTrimRepository();
        if (clanRepo == null || trimRepo == null) return;

        Optional<Clan> clan = clanRepo.byPlayer(player.getUniqueId());
        if (clan.isEmpty()) return;

        Optional<ArmorTrimRepository.TrimSpec> spec = trimRepo.byTagSlot(clan.get().tag(), slot);
        if (spec.isEmpty()) return;

        applyTrim(player, slot, equipped, spec.get());
    }

    private static ArmorTrimRepository.Slot mapSlot(PlayerArmorChangeEvent.SlotType slot) {
        return switch (slot) {
            case HEAD -> ArmorTrimRepository.Slot.HEAD;
            case CHEST -> ArmorTrimRepository.Slot.CHEST;
            case LEGS -> ArmorTrimRepository.Slot.LEGS;
            case FEET -> ArmorTrimRepository.Slot.FEET;
        };
    }

    /**
     * Apply the trim onto the equipped ItemStack. Bukkit's Registry
     * lookup returns null when the server's data pack doesn't ship the
     * material / pattern — we bail in that case rather than crash, so
     * a future-pattern operator setting downgrades gracefully if the
     * server reverts to an older snapshot.
     */
    private void applyTrim(
            Player player,
            ArmorTrimRepository.Slot slot,
            ItemStack item,
            ArmorTrimRepository.TrimSpec spec) {
        if (!(item.getItemMeta() instanceof ArmorMeta meta)) return;

        TrimMaterial material = Registry.TRIM_MATERIAL.get(
                NamespacedKey.minecraft(spec.material()));
        TrimPattern pattern = Registry.TRIM_PATTERN.get(
                NamespacedKey.minecraft(spec.pattern()));
        if (material == null || pattern == null) {
            if (plugin.getPluginConfig().isDebugLogging()) {
                plugin.getLogger().fine("trim registry miss for "
                        + spec.material() + "/" + spec.pattern());
            }
            return;
        }

        ArmorTrim trim = new ArmorTrim(material, pattern);
        ArmorTrim existing = meta.getTrim();
        if (existing != null
                && existing.getMaterial().equals(material)
                && existing.getPattern().equals(pattern)) {
            // Already applied — re-equipping the same piece shouldn't
            // bump the meta + send a packet for nothing.
            return;
        }

        meta.setTrim(trim);
        item.setItemMeta(meta);

        // Bukkit's PlayerArmorChangeEvent doesn't auto-refresh the
        // inventory slot when we mutate via setItemMeta during the
        // event; force the right slot through PlayerInventory so the
        // client sees the new NBT. Same trick the banner listener uses.
        Bukkit.getScheduler().runTask(plugin, () -> {
            switch (slot) {
                case HEAD -> player.getInventory().setHelmet(item);
                case CHEST -> player.getInventory().setChestplate(item);
                case LEGS -> player.getInventory().setLeggings(item);
                case FEET -> player.getInventory().setBoots(item);
            }
        });
    }
}
