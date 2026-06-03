package dev.crestoria.listener;

import dev.crestoria.CrestoriaPlugin;
import dev.crestoria.api.dto.BannerDto;
import dev.crestoria.api.dto.ClanDto;
import org.bukkit.entity.HumanEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.event.player.PlayerItemHeldEvent;
import org.bukkit.event.player.PlayerSwapHandItemsEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.PlayerInventory;

import java.util.Optional;

/**
 * Auto-applies (or strips) the clan banner spec on every shield the
 * player puts into their main- or off-hand. Hooks just enough events
 * to cover the visible cases without sweeping the inventory each
 * tick:
 *
 * <ul>
 *   <li>{@link PlayerItemHeldEvent} — hotbar scroll into a shield
 *       slot (or out of one, when the new hand item is a shield).</li>
 *   <li>{@link PlayerSwapHandItemsEvent} — F-key main↔off-hand swap.</li>
 *   <li>{@link EntityPickupItemEvent} — pick up a shield from the
 *       ground so the resulting item already carries the right
 *       branding before it ever appears in hand.</li>
 * </ul>
 *
 * On join, {@link PlayerJoinListener} hands off to {@link
 * #reconcileHands(Player)} via a 2-tick scheduled call so a player
 * who logged out gripping a shield doesn't render a stale banner
 * until the next swap.
 *
 * <p>The reconcile is delegated to {@link ClanShieldStamper}; this
 * listener is just the event wiring + clan-spec lookup.
 */
public final class ClanShieldListener implements Listener {

    private final CrestoriaPlugin plugin;

    public ClanShieldListener(CrestoriaPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onHotbarChange(PlayerItemHeldEvent event) {
        // Hotbar scroll only changes the main-hand reference; off-hand
        // is untouched. Reconcile both anyway — cheap, no rewrite if
        // the marker already matches the clan tag (see Stamper).
        reconcileHands(event.getPlayer());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onHandSwap(PlayerSwapHandItemsEvent event) {
        reconcileHands(event.getPlayer());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent event) {
        if (!(event.getEntity() instanceof Player player)) return;
        ItemStack picked = event.getItem().getItemStack();
        if (!ClanShieldStamper.isShield(picked)) return;
        ClanDto clan = plugin.getClanRepository().getByPlayer(player.getUniqueId()).orElse(null);
        boolean mutated;
        if (clan == null) {
            mutated = ClanShieldStamper.stripIfOurs(picked);
        } else {
            BannerDto banner = plugin.getBannerRepository().get(clan.tag).orElse(null);
            mutated = banner != null && ClanShieldStamper.apply(picked, banner, clan.tag, plugin);
        }
        if (mutated) {
            // Write the mutated stack back onto the dropped item entity
            // before vanilla transfers it into the inventory — otherwise
            // the item ends up in inv slot with our changes dropped on
            // Paper builds that defensive-copy the stack reference.
            event.getItem().setItemStack(picked);
            plugin.debugLog(() -> "[shield] pickup reconciled for "
                    + player.getName() + " clan=" + (clan == null ? "<none>" : clan.tag));
        }
    }

    // Equipping a shield into the off-hand slot through the inventory
    // GUI — click or drag into slot 40, shift-click a shield, or a
    // hotbar number-swap — fires NONE of the held/swap/pickup events
    // above; only an inventory event. Without these the shield stayed
    // unbranded until the next F-swap or relog (the "only on join"
    // bug). Reconcile one tick later, after the click has resolved so
    // the hand slots reflect the final state.
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
            if (player.isOnline()) reconcileHands(player);
        }, 1L);
    }

    /**
     * Walk main + off hand, write or strip our banner depending on
     * what the wearer's clan currently configures. The stack returned
     * by {@code getItemInMainHand} is a defensive copy on Paper
     * 26.1.2, so every mutation has to be written back explicitly
     * via {@code setItemInMainHand} / {@code setItemInOffHand}.
     */
    public void reconcileHands(Player player) {
        ClanDto clan = plugin.getClanRepository().getByPlayer(player.getUniqueId()).orElse(null);
        Optional<BannerDto> banner = clan == null
                ? Optional.empty()
                : plugin.getBannerRepository().get(clan.tag);
        PlayerInventory inv = player.getInventory();
        ItemStack main = inv.getItemInMainHand();
        if (reconcileSlot(main, clan, banner.orElse(null), "main", player)) {
            inv.setItemInMainHand(main);
        }
        ItemStack off = inv.getItemInOffHand();
        if (reconcileSlot(off, clan, banner.orElse(null), "off", player)) {
            inv.setItemInOffHand(off);
        }
    }

    /**
     * @return true when the stack was mutated and the caller must
     *   write it back to the inventory.
     */
    private boolean reconcileSlot(ItemStack stack, ClanDto clan, BannerDto banner,
                                  String slotLabel, Player player) {
        if (!ClanShieldStamper.isShield(stack)) return false;
        if (clan != null && banner != null) {
            if (ClanShieldStamper.apply(stack, banner, clan.tag, plugin)) {
                plugin.debugLog(() -> "[shield] auto-applied [" + clan.tag + "] banner ("
                        + slotLabel + " hand of " + player.getName() + ")");
                return true;
            }
            return false;
        }
        if (ClanShieldStamper.stripIfOurs(stack)) {
            plugin.debugLog(() -> "[shield] stripped clan banner ("
                    + slotLabel + " hand of " + player.getName() + ")");
            return true;
        }
        return false;
    }
}
