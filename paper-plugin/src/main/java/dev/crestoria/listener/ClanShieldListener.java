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
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Clan-shield branding — "first claim locks it" model.
 *
 * <p>A shield held in EITHER hand by a clan member is auto-painted with the
 * clan banner + base colour and stamped with a permanent owner tag (PDC
 * marker) — but ONLY while it is blank (no tag yet). The instant a shield
 * carries a tag it is locked: the auto-brander never touches it again, no
 * matter who holds it. Consequences:
 *
 * <ul>
 *   <li>Pick up / craft a blank shield as a clan member → it becomes your
 *       clan's shield the moment it is in your hand, in any hand.</li>
 *   <li>A looted trophy shield (already tagged by the enemy clan) keeps
 *       its banner forever — holding it never re-paints it.</li>
 *   <li>Your clan redesigns its banner → already-claimed shields do NOT
 *       auto-update (they are locked). Re-run {@code /clan shield} to force
 *       a repaint — that command is the explicit override and re-stamps a
 *       held shield even when it is already tagged.</li>
 * </ul>
 *
 * Every hand-affecting event funnels into a deferred {@link #reconcileHeld}
 * so the hand slots reflect the final state before we read them.
 */
public final class ClanShieldListener implements Listener {

    private final CrestoriaPlugin plugin;

    /**
     * Players with a reconcile already queued for the next tick. Coalesces a
     * burst of hand-affecting events (a player clicking rapidly through a
     * chest fires many InventoryClickEvents) into a single reconcile pass.
     * Main-thread-only in practice, but a concurrent set keeps it safe.
     */
    private final Set<UUID> pendingReconcile = ConcurrentHashMap.newKeySet();

    public ClanShieldListener(CrestoriaPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onHotbarChange(PlayerItemHeldEvent event) {
        scheduleReconcile(event.getPlayer());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onHandSwap(PlayerSwapHandItemsEvent event) {
        scheduleReconcile(event.getPlayer());
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent event) {
        if (event.getEntity() instanceof Player player) scheduleReconcile(player);
    }

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
        UUID id = player.getUniqueId();
        // InventoryClickEvent (and friends) fire on every click in every
        // inventory for every player. Two cheap guards keep this off the hot
        // path for the 99% of events that can't matter:
        //   1. only clan members ever get a shield reconcile — a single
        //      O(1) snapshot map lookup, no allocation;
        //   2. coalesce a burst into one queued task per tick window.
        if (plugin.getClanRepository().getByPlayer(id).isEmpty()) return;
        if (!pendingReconcile.add(id)) return;
        plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            pendingReconcile.remove(id);
            if (player.isOnline()) reconcileHeld(player);
        }, 1L);
    }

    /**
     * Claim any BLANK shield in either hand for the holder's clan. Tagged
     * shields (own or trophy) are skipped — locked. The stacks from
     * {@code getItemInMainHand/OffHand} are defensive copies on Paper
     * 26.1.2, so a claimed stack is written back explicitly.
     */
    public void reconcileHeld(Player player) {
        ClanDto clan = plugin.getClanRepository().getByPlayer(player.getUniqueId()).orElse(null);
        if (clan == null) return;
        Optional<BannerDto> banner = plugin.getBannerRepository().get(clan.tag);
        if (banner.isEmpty()) return; // no design to stamp — leave shields blank

        PlayerInventory inv = player.getInventory();
        ItemStack main = inv.getItemInMainHand();
        if (claimIfBlank(main, clan.tag, banner.get(), player, "main")) {
            inv.setItemInMainHand(main);
        }
        ItemStack off = inv.getItemInOffHand();
        if (claimIfBlank(off, clan.tag, banner.get(), player, "off")) {
            inv.setItemInOffHand(off);
        }
    }

    /**
     * @return true when a blank shield was claimed (and must be written
     *   back). Shields that already carry an owner tag are left untouched.
     */
    private boolean claimIfBlank(ItemStack shield, String tag, BannerDto banner,
                                 Player player, String slot) {
        if (!ClanShieldStamper.isShield(shield)) return false;
        if (ClanShieldStamper.readMarker(shield) != null) return false; // locked
        boolean claimed = ClanShieldStamper.apply(shield, banner, tag, plugin);
        if (claimed) {
            plugin.debugLog(() -> "[shield] claimed blank shield for [" + tag + "] "
                    + player.getName() + " (" + slot + " hand)");
        }
        return claimed;
    }
}
