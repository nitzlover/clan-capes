package dev.crestoria.listener;

import dev.crestoria.CrestoriaPlugin;
import dev.crestoria.api.dto.BannerDto;
import dev.crestoria.api.dto.ClanDto;
import org.bukkit.entity.HumanEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.event.player.PlayerSwapHandItemsEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.PlayerInventory;

import java.util.Optional;

/**
 * Auto-brands the clan banner onto the shield a player puts in their
 * OFF-HAND — and only the off-hand. Main-hand / hotbar shields are never
 * touched, so a looted trophy shield carrying another clan's banner stays
 * a trophy when you merely scroll past it in the hotbar or pick it up off
 * the ground.
 *
 * <p>Two further trophy guards in {@link #reconcileOffHand}:
 * <ul>
 *   <li>a shield whose owner marker is a DIFFERENT clan than the holder's
 *       current clan is left completely alone — never re-stamped, never
 *       stripped;</li>
 *   <li>only blank shields (no marker) or the holder's own
 *       previously-branded shields are (re)painted.</li>
 * </ul>
 *
 * Events hooked (all resolve to an off-hand reconcile):
 * <ul>
 *   <li>{@link PlayerSwapHandItemsEvent} — F-key main↔off swap.</li>
 *   <li>{@link InventoryClickEvent}/{@link InventoryDragEvent}/{@link
 *       InventoryCloseEvent} — moving a shield into the off-hand slot
 *       (40) through the inventory GUI; deferred one tick so the off-hand
 *       slot reflects the final state.</li>
 * </ul>
 * On join, {@link PlayerJoinListener} calls {@link #reconcileOffHand} two
 * ticks late so a player who logged out gripping their clan shield
 * re-brands it.
 *
 * <p>Manual {@code /clan shield} still force-stamps via {@link
 * ClanShieldStamper} directly — that path is an explicit operator action
 * and intentionally bypasses these auto guards (e.g. to re-brand a
 * captured shield on purpose).
 */
public final class ClanShieldListener implements Listener {

    private final CrestoriaPlugin plugin;

    public ClanShieldListener(CrestoriaPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onHandSwap(PlayerSwapHandItemsEvent event) {
        scheduleReconcile(event.getPlayer());
    }

    // Moving a shield into the off-hand slot (40) through the inventory
    // GUI — click or drag into slot 40, shift-click, hotbar number-swap —
    // fires only an inventory event. Reconcile one tick later, after the
    // interaction resolves so the off-hand slot is final.
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onInventoryClick(InventoryClickEvent event) {
        scheduleReconcile(event.getWhoClicked());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onInventoryDrag(InventoryDragEvent event) {
        scheduleReconcile(event.getWhoClicked());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onInventoryClose(InventoryCloseEvent event) {
        scheduleReconcile(event.getPlayer());
    }

    private void scheduleReconcile(HumanEntity human) {
        if (!(human instanceof Player player)) return;
        plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            if (player.isOnline()) reconcileOffHand(player);
        }, 1L);
    }

    /**
     * Brand / update / strip ONLY the off-hand shield, trophy-safely. The
     * stack returned by {@code getItemInOffHand} is a defensive copy on
     * Paper 26.1.2, so a mutation must be written back via {@code
     * setItemInOffHand}.
     */
    public void reconcileOffHand(Player player) {
        PlayerInventory inv = player.getInventory();
        ItemStack off = inv.getItemInOffHand();
        if (!ClanShieldStamper.isShield(off)) return;

        ClanDto clan = plugin.getClanRepository().getByPlayer(player.getUniqueId()).orElse(null);
        String myTag = clan == null ? null : clan.tag;
        String marker = ClanShieldStamper.readMarker(off);

        // Trophy guard: a shield branded by a clan that ISN'T the holder's
        // current clan is left exactly as-is — looted enemy shields keep
        // their banner. marker == null means a blank shield (brandable).
        if (marker != null && (myTag == null || !marker.equalsIgnoreCase(myTag))) {
            return;
        }

        Optional<BannerDto> banner = clan == null
                ? Optional.empty()
                : plugin.getBannerRepository().get(clan.tag);

        boolean mutated = false;
        if (clan != null && banner.isPresent()) {
            // Blank shield, or my own → paint / refresh my clan banner.
            mutated = ClanShieldStamper.apply(off, banner.get(), clan.tag, plugin);
            if (mutated) {
                plugin.debugLog(() -> "[shield] off-hand branded [" + clan.tag
                        + "] for " + player.getName());
            }
        } else if (marker != null) {
            // marker == my own tag but I no longer have a clan/banner →
            // strip my stale branding. (Trophies excluded by the guard.)
            mutated = ClanShieldStamper.stripIfOurs(off);
            if (mutated) {
                plugin.debugLog(() -> "[shield] off-hand stripped own branding for "
                        + player.getName());
            }
        }
        if (mutated) inv.setItemInOffHand(off);
    }
}
