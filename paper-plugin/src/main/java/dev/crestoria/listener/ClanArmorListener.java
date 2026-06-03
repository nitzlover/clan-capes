package dev.crestoria.listener;

import dev.crestoria.CrestoriaPlugin;
import dev.crestoria.api.dto.ClanDto;
import dev.crestoria.api.dto.TrimDto;
import io.papermc.paper.event.entity.EntityEquipmentChangedEvent;
import org.bukkit.NamespacedKey;
import org.bukkit.Registry;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.PlayerInventory;
import org.bukkit.inventory.meta.ArmorMeta;
import org.bukkit.inventory.meta.trim.ArmorTrim;
import org.bukkit.inventory.meta.trim.TrimMaterial;
import org.bukkit.inventory.meta.trim.TrimPattern;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.scheduler.BukkitTask;

import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/**
 * Drives vanilla armour-trim NBT directly on the worn ItemStack so
 * every player on the server — modded or not — sees the clan trim
 * through the standard render pipeline.
 *
 * <h2>1.0.8 — event swap + write-back fix</h2>
 * Paper 26.1.2 deprecated {@code PlayerArmorChangeEvent} (the
 * handler still compiles but no longer fires), so 1.0.7's trims
 * only ever applied via the 2-tick {@link PlayerJoinListener}
 * scheduled reconcile — i.e. the "only on relog" symptom from
 * Crownless. This listener migrates to the modern {@link
 * EntityEquipmentChangedEvent}, which carries every changed slot
 * in a single map.
 *
 * <p>The other half of the fix is the explicit write-back: Paper
 * 26.1.2 returns defensive copies from
 * {@code Player.getInventory().getHelmet()} and friends, so
 * mutating the returned stack alone is not enough. Every
 * apply/strip path now ends with a
 * {@code setHelmet/setChestplate/...} call on the inventory.
 *
 * <h2>Marker policy (unchanged from 1.0.6)</h2>
 * Each event we get:
 * <ol>
 *   <li>Player in a clan with a trim configured for the slot →
 *       write {@link ArmorTrim} + stamp the PDC marker
 *       {@link #TRIM_OWNER_KEY} with the clan tag, then write the
 *       stack back to the inventory.</li>
 *   <li>Stack carries the marker but the wearer has no clan trim
 *       → strip the trim and the marker, write back. Cleanup for
 *       armour that changed hands (drop / chest / death).</li>
 *   <li>No marker + no clan trim → leave the stack alone so
 *       vanilla trims a player crafted survive untouched.</li>
 * </ol>
 */
public final class ClanArmorListener implements Listener {

    /** PDC key stamped on every armour stack the listener trims. */
    public static final NamespacedKey TRIM_OWNER_KEY = new NamespacedKey("crestoria", "trim_owner");
    /**
     * Pre-rebrand key (project was "ClanCapes"). Read-only fallback so armour
     * stamped before the Crestoria rename is still recognised; re-stamping
     * migrates it onto {@link #TRIM_OWNER_KEY}.
     */
    public static final NamespacedKey LEGACY_TRIM_OWNER_KEY = new NamespacedKey("clancapes", "trim_owner");

    private final CrestoriaPlugin plugin;

    public ClanArmorListener(CrestoriaPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onEquipmentChange(EntityEquipmentChangedEvent event) {
        if (!(event.getEntity() instanceof Player player)) return;
        PlayerInventory inv = player.getInventory();
        UUID uuid = player.getUniqueId();
        for (var entry : event.getEquipmentChanges().entrySet()) {
            String slotKey = armorSlotKey(entry.getKey());
            if (slotKey == null) continue;
            ItemStack worn = entry.getValue().newItem();
            if (worn == null || worn.getType().isAir()) continue;
            ItemStack reconciled = reconcile(uuid, worn, slotKey);
            if (reconciled != null) {
                writeBack(inv, entry.getKey(), reconciled);
            }
        }
    }

    /**
     * Reconcile the trim component on the given stack against the
     * wearer's current clan + trim spec. Returns the mutated stack
     * the caller should write back to the inventory, or {@code null}
     * when nothing changed (caller can skip the {@code setHelmet}
     * call entirely).
     */
    public ItemStack reconcile(UUID playerUuid, ItemStack stack, String slot) {
        if (stack == null || stack.getType().isAir()) return null;
        ClanDto clan = plugin.getClanRepository().getByPlayer(playerUuid).orElse(null);
        Optional<TrimDto> wanted = clan == null
                ? Optional.empty()
                : plugin.getArmorTrimRepository().get(clan.tag, slot);

        if (wanted.isPresent() && clan != null) {
            return applyTrim(stack, wanted.get(), clan.tag);
        }
        if (hasMarker(stack)) {
            return stripTrim(stack);
        }
        return null;
    }

    /** Walk every armour slot the player is currently wearing and reconcile. */
    public void reconcileAll(Player player) {
        UUID uuid = player.getUniqueId();
        PlayerInventory inv = player.getInventory();
        ItemStack helmet = reconcile(uuid, inv.getHelmet(), "head");
        if (helmet != null) inv.setHelmet(helmet);
        ItemStack chest = reconcile(uuid, inv.getChestplate(), "chest");
        if (chest != null) inv.setChestplate(chest);
        ItemStack legs = reconcile(uuid, inv.getLeggings(), "legs");
        if (legs != null) inv.setLeggings(legs);
        ItemStack feet = reconcile(uuid, inv.getBoots(), "feet");
        if (feet != null) inv.setBoots(feet);
    }

    /** Map an {@link EquipmentSlot} to the panel's per-slot key string. */
    private static String armorSlotKey(EquipmentSlot slot) {
        return switch (slot) {
            case HEAD -> "head";
            case CHEST -> "chest";
            case LEGS -> "legs";
            case FEET -> "feet";
            default -> null;
        };
    }

    /** Write the reconciled stack back to the correct inventory slot. */
    private static void writeBack(PlayerInventory inv, EquipmentSlot slot, ItemStack stack) {
        switch (slot) {
            case HEAD -> inv.setHelmet(stack);
            case CHEST -> inv.setChestplate(stack);
            case LEGS -> inv.setLeggings(stack);
            case FEET -> inv.setBoots(stack);
            default -> { /* not an armour slot — caller filtered already */ }
        }
    }

    /**
     * Write the {@link ArmorTrim} component (vanilla NBT, visible to
     * every viewing client without a mod) and stamp the PDC marker
     * with the owning clan tag. Returns the mutated stack (always
     * non-null when an apply actually happened).
     */
    private ItemStack applyTrim(ItemStack stack, TrimDto spec, String clanTag) {
        ItemStack copy = stack.clone();
        if (!(copy.getItemMeta() instanceof ArmorMeta meta)) return null;

        Optional<TrimMaterial> material = resolve(spec.material, Registry.TRIM_MATERIAL);
        Optional<TrimPattern> pattern = resolve(spec.pattern, Registry.TRIM_PATTERN);
        if (material.isEmpty() || pattern.isEmpty()) {
            plugin.debugLog(() -> "[trim] unresolved spec for clan " + clanTag
                    + " — material=" + spec.material + " pattern=" + spec.pattern);
            return null;
        }
        ArmorTrim desired = new ArmorTrim(material.get(), pattern.get());
        ArmorTrim current = meta.hasTrim() ? meta.getTrim() : null;
        String marker = readMarker(meta);
        if (desired.equals(current) && clanTag.equalsIgnoreCase(marker)) {
            return null; // already correct — skip the inventory write
        }
        meta.setTrim(desired);
        meta.getPersistentDataContainer().set(TRIM_OWNER_KEY, PersistentDataType.STRING, clanTag);
        meta.getPersistentDataContainer().remove(LEGACY_TRIM_OWNER_KEY); // migrate off pre-rebrand key
        copy.setItemMeta(meta);
        plugin.debugLog(() -> "[trim] applied " + spec.material + "/" + spec.pattern
                + " for clan " + clanTag + " on " + copy.getType());
        return copy;
    }

    /**
     * Strip the trim + marker. Only called when the stack already has
     * our marker, so vanilla-trimmed armour a player crafted themselves
     * is never touched.
     */
    private ItemStack stripTrim(ItemStack stack) {
        ItemStack copy = stack.clone();
        if (!(copy.getItemMeta() instanceof ArmorMeta meta)) return null;
        if (meta.hasTrim()) meta.setTrim(null);
        meta.getPersistentDataContainer().remove(TRIM_OWNER_KEY);
        meta.getPersistentDataContainer().remove(LEGACY_TRIM_OWNER_KEY);
        copy.setItemMeta(meta);
        plugin.debugLog(() -> "[trim] stripped clan trim from " + copy.getType());
        return copy;
    }

    private boolean hasMarker(ItemStack stack) {
        if (stack == null || stack.getType().isAir()) return false;
        if (!(stack.getItemMeta() instanceof ArmorMeta meta)) return false;
        return readMarker(meta) != null;
    }

    private static String readMarker(ArmorMeta meta) {
        PersistentDataContainer pdc = meta.getPersistentDataContainer();
        if (pdc.has(TRIM_OWNER_KEY, PersistentDataType.STRING)) {
            return pdc.get(TRIM_OWNER_KEY, PersistentDataType.STRING);
        }
        if (pdc.has(LEGACY_TRIM_OWNER_KEY, PersistentDataType.STRING)) {
            return pdc.get(LEGACY_TRIM_OWNER_KEY, PersistentDataType.STRING);
        }
        return null;
    }

    /**
     * Resolve a panel-supplied string id ({@code "diamond"} or
     * {@code "minecraft:sentry"}) to a registry value. {@code minecraft:}
     * is inferred when the namespace is omitted. Unknown ids return
     * empty — caller logs and leaves the slot un-trimmed.
     */
    private static <T extends org.bukkit.Keyed> Optional<T> resolve(String id, Registry<T> registry) {
        if (id == null || id.isBlank()) return Optional.empty();
        String normalised = id.contains(":") ? id : "minecraft:" + id;
        try {
            NamespacedKey key = NamespacedKey.fromString(normalised.toLowerCase(Locale.ROOT));
            if (key == null) return Optional.empty();
            T value = registry.get(key);
            return Optional.ofNullable(value);
        } catch (Throwable t) {
            return Optional.empty();
        }
    }

    /**
     * Convenience used by {@link PlayerJoinListener} on join — fires a
     * single reconcile pass two ticks later so the inventory has
     * settled and the cache is warm.
     */
    public BukkitTask scheduleJoinReconcile(Player player) {
        return plugin.getServer().getScheduler().runTaskLater(plugin,
                () -> reconcileAll(player), 2L);
    }
}
