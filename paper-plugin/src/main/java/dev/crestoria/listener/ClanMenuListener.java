package dev.crestoria.listener;

import dev.crestoria.command.ClanMenu;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.inventory.InventoryHolder;

/**
 * Routes clicks in the {@code /clan menu} chest GUI to the matching
 * {@code /clan} subcommand. Recognises the menu by its custom
 * {@link ClanMenu.Holder} so no other inventory is affected.
 *
 * <p>Cancels the click (it's a button board, not a container the
 * player can take items from), closes the menu, then runs the routed
 * command so chat output + permission checks flow through
 * {@code ClanCommand} unchanged.
 */
public final class ClanMenuListener implements Listener {

    @EventHandler
    public void onClick(InventoryClickEvent event) {
        InventoryHolder holder = event.getInventory().getHolder();
        if (!(holder instanceof ClanMenu.Holder menu)) return;

        // Always cancel — the menu is read-only chrome.
        event.setCancelled(true);
        if (!(event.getWhoClicked() instanceof Player player)) return;
        // Ignore clicks in the player's own inventory half.
        if (event.getClickedInventory() == null
                || !(event.getClickedInventory().getHolder() instanceof ClanMenu.Holder)) {
            return;
        }

        String cmd = menu.routeFor(event.getRawSlot());
        if (cmd == null) return;
        player.closeInventory();
        player.performCommand(cmd);
    }
}
