package dev.clancapes.listener;

import com.destroystokyo.paper.event.player.PlayerArmorChangeEvent;
import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.api.dto.ClanDto;
import dev.clancapes.api.dto.TrimDto;
import org.bukkit.NamespacedKey;
import org.bukkit.Registry;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
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
 * through the standard render pipeline. Replaces the client-side
 * mod-only render the Fabric mod used to do for trims.
 *
 * <h2>State machine</h2>
 * Each {@link PlayerArmorChangeEvent} fires for one slot at a time.
 * For the newly-worn stack we ask three questions:
 * <ol>
 *   <li>Is the player in a clan that has a trim configured for this
 *       slot? → write {@link ArmorTrim} + stamp the PDC marker
 *       {@link #TRIM_OWNER_KEY} with the clan tag.</li>
 *   <li>Does the stack carry the marker but the wearer is in a
 *       different clan / no clan / no slot trim? → strip the trim
 *       and the marker. This is the cleanup path for armour that
 *       changed hands (dropped on death, traded, picked up from a
 *       chest).</li>
 *   <li>No marker, no clan trim → leave the stack alone so vanilla
 *       trims a player crafted themselves survive untouched.</li>
 * </ol>
 *
 * <h2>What this means for "leakage"</h2>
 * A trimmed stack sitting in a chest stays visually trimmed — that's
 * cosmetic information already public (clans + their trims are listed
 * on {@code /clan info}). The marker ensures the trim is re-evaluated
 * the moment the stack is worn again, so a non-clan player wearing
 * the armour instantly loses the overlay.
 */
public final class ClanArmorListener implements Listener {

    /** PDC key stamped on every armour stack the listener trims. */
    public static final NamespacedKey TRIM_OWNER_KEY = new NamespacedKey("clancapes", "trim_owner");

    private final ClanCapesPlugin plugin;

    public ClanArmorListener(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onArmorChange(PlayerArmorChangeEvent event) {
        ItemStack worn = event.getNewItem();
        if (worn == null || worn.getType().isAir()) return;
        String slot = slotKey(event.getSlotType());
        if (slot == null) return;
        reconcile(event.getPlayer().getUniqueId(), worn, slot);
    }

    /**
     * Reconcile the trim component on the given stack against the
     * wearer's current clan + trim spec. The stack is mutated in
     * place — callers either rely on the event's reference or set the
     * returned modification back into the inventory slot themselves
     * (the armour-change event hands us the live reference).
     */
    public void reconcile(UUID playerUuid, ItemStack stack, String slot) {
        if (stack == null || stack.getType().isAir()) return;
        ClanDto clan = plugin.getClanRepository().getByPlayer(playerUuid).orElse(null);
        Optional<TrimDto> wanted = clan == null
                ? Optional.empty()
                : plugin.getArmorTrimRepository().get(clan.tag, slot);

        if (wanted.isPresent() && clan != null) {
            applyTrim(stack, wanted.get(), clan.tag);
        } else if (hasMarker(stack)) {
            stripTrim(stack);
        }
        // else: no clan-trim wanted, no marker on stack → nothing to do.
    }

    /** Walk every armour slot the player is currently wearing and reconcile. */
    public void reconcileAll(org.bukkit.entity.Player player) {
        UUID uuid = player.getUniqueId();
        var inv = player.getInventory();
        ItemStack[] order = { inv.getHelmet(), inv.getChestplate(), inv.getLeggings(), inv.getBoots() };
        String[] slots = { "head", "chest", "legs", "feet" };
        for (int i = 0; i < 4; i++) {
            if (order[i] == null) continue;
            reconcile(uuid, order[i], slots[i]);
        }
    }

    /**
     * Write the {@link ArmorTrim} component (vanilla NBT, visible to
     * every viewing client without a mod) and stamp the PDC marker
     * with the owning clan tag so cleanup can recognise our writes
     * later.
     */
    private void applyTrim(ItemStack stack, TrimDto spec, String clanTag) {
        ArmorMeta meta = stack.getItemMeta() instanceof ArmorMeta am ? am : null;
        if (meta == null) return;

        Optional<TrimMaterial> material = resolve(spec.material, Registry.TRIM_MATERIAL);
        Optional<TrimPattern> pattern = resolve(spec.pattern, Registry.TRIM_PATTERN);
        if (material.isEmpty() || pattern.isEmpty()) {
            plugin.debugLog(() -> "[trim] unresolved spec for clan " + clanTag
                    + " — material=" + spec.material + " pattern=" + spec.pattern);
            return;
        }
        ArmorTrim desired = new ArmorTrim(material.get(), pattern.get());
        ArmorTrim current = meta.hasTrim() ? meta.getTrim() : null;
        String marker = readMarker(meta);
        if (desired.equals(current) && clanTag.equalsIgnoreCase(marker)) {
            return; // already correct — no need to rewrite NBT
        }
        meta.setTrim(desired);
        meta.getPersistentDataContainer().set(TRIM_OWNER_KEY, PersistentDataType.STRING, clanTag);
        stack.setItemMeta(meta);
        plugin.debugLog(() -> "[trim] applied " + spec.material + "/" + spec.pattern
                + " for clan " + clanTag + " on " + stack.getType());
    }

    /**
     * Strip the trim + marker. Only called when the stack already has
     * our marker, so vanilla-trimmed armour a player crafted themselves
     * is never touched.
     */
    private void stripTrim(ItemStack stack) {
        if (!(stack.getItemMeta() instanceof ArmorMeta meta)) return;
        if (meta.hasTrim()) meta.setTrim(null);
        meta.getPersistentDataContainer().remove(TRIM_OWNER_KEY);
        stack.setItemMeta(meta);
        plugin.debugLog(() -> "[trim] stripped clan trim from " + stack.getType());
    }

    private boolean hasMarker(ItemStack stack) {
        if (!(stack.getItemMeta() instanceof ArmorMeta meta)) return false;
        return readMarker(meta) != null;
    }

    private static String readMarker(ArmorMeta meta) {
        PersistentDataContainer pdc = meta.getPersistentDataContainer();
        return pdc.has(TRIM_OWNER_KEY, PersistentDataType.STRING)
                ? pdc.get(TRIM_OWNER_KEY, PersistentDataType.STRING)
                : null;
    }

    private static String slotKey(PlayerArmorChangeEvent.SlotType type) {
        if (type == null) return null;
        return switch (type) {
            case HEAD -> "head";
            case CHEST -> "chest";
            case LEGS -> "legs";
            case FEET -> "feet";
        };
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
    public BukkitTask scheduleJoinReconcile(org.bukkit.entity.Player player) {
        return plugin.getServer().getScheduler().runTaskLater(plugin,
                () -> reconcileAll(player), 2L);
    }

    /** Unused enum reference — kept to surface a compile error if Paper renames the slot type. */
    @SuppressWarnings("unused")
    private static void assertEquipmentSlots() {
        EquipmentSlot ignored = EquipmentSlot.HEAD;
    }
}
