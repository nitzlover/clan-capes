package dev.clancapes.listener;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.service.BannerService;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.player.PlayerItemHeldEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerSwapHandItemsEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.PlayerInventory;

/**
 * Listens for the moments a player can change which item they're holding
 * and re-applies the clan banner onto any SHIELD that ends up in their
 * main/off hand. We catch:
 *
 *   PlayerJoinEvent           — player logs back in with shield already equipped
 *   PlayerItemHeldEvent       — hotbar slot change
 *   PlayerSwapHandItemsEvent  — F-key (main ⇄ off-hand)
 *   InventoryClickEvent       — player rearranges inventory, may end with a
 *                                shield in hand
 *
 * Each handler runs one tick later (via runTask) because the events fire
 * BEFORE the inventory state is fully committed; reading {@code getItemInMainHand}
 * synchronously in the handler returns the pre-event state.
 */
public final class ShieldBannerListener implements Listener {
    private final ClanCapesPlugin plugin;
    private final BannerService bannerService;

    public ShieldBannerListener(ClanCapesPlugin plugin, BannerService bannerService) {
        this.plugin = plugin;
        this.bannerService = bannerService;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        scheduleApply(event.getPlayer());
    }

    @EventHandler
    public void onHeldChange(PlayerItemHeldEvent event) {
        Player player = event.getPlayer();
        // The new slot's item is available immediately on this event, but
        // we still re-apply on the next tick because some plugins (or the
        // server's own anti-cheat) re-set the slot after this handler runs.
        ItemStack incoming = player.getInventory().getItem(event.getNewSlot());
        if (incoming != null && incoming.getType() == Material.SHIELD) {
            scheduleApply(player);
        } else if (player.getInventory().getItemInOffHand().getType() == Material.SHIELD) {
            scheduleApply(player);
        }
    }

    @EventHandler
    public void onSwap(PlayerSwapHandItemsEvent event) {
        if (event.isCancelled()) {
            return;
        }
        scheduleApply(event.getPlayer());
    }

    @EventHandler
    public void onInventoryClick(InventoryClickEvent event) {
        if (!(event.getWhoClicked() instanceof Player player)) {
            return;
        }
        PlayerInventory inv = player.getInventory();
        // Only bother if the click could have placed/removed a shield in a hand slot.
        ItemStack cursor = event.getCursor();
        boolean involvesShield =
                (cursor != null && cursor.getType() == Material.SHIELD)
                        || (event.getCurrentItem() != null && event.getCurrentItem().getType() == Material.SHIELD)
                        || inv.getItemInMainHand().getType() == Material.SHIELD
                        || inv.getItemInOffHand().getType() == Material.SHIELD;
        if (!involvesShield) {
            return;
        }
        scheduleApply(player);
    }

    private void scheduleApply(Player player) {
        Bukkit.getScheduler().runTask(plugin, () -> bannerService.applyToHeldShields(player));
    }
}
