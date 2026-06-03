package dev.crestoria.command;

import dev.crestoria.util.Msg;
import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * The {@code /clan menu} chest GUI.
 *
 * <p>Each button re-dispatches an existing {@code /clan} subcommand
 * via {@link Player#performCommand(String)} — the GUI is a pointer
 * surface, not a second implementation, so command logic + permission
 * checks live in exactly one place ({@link ClanCommand}).
 *
 * <p>Identified by a custom {@link InventoryHolder} so the click
 * listener can recognise the menu without matching on title text.
 */
public final class ClanMenu {

    /** Marker holder carrying the slot → command routing table. */
    public static final class Holder implements InventoryHolder {
        private final Map<Integer, String> routes = new HashMap<>();
        private Inventory inventory;

        public String routeFor(int slot) {
            return routes.get(slot);
        }

        @Override
        public Inventory getInventory() {
            return inventory;
        }
    }

    private record Button(int slot, Material icon, String name, String command,
                          List<String> lore) {}

    // 6-row chest (54 slots). Buttons centred on the second + fourth rows.
    private static final List<Button> BUTTONS = List.of(
            new Button(10, Material.PAPER, "§eClan Info", "clan info",
                    List.of("§7Tag, members, K/D, announcement")),
            new Button(12, Material.PLAYER_HEAD, "§eMembers", "clan info",
                    List.of("§7Roster + roles")),
            new Button(14, Material.WHITE_BANNER, "§eBanner", "clan panel",
                    List.of("§7Edit on the web panel")),
            new Button(16, Material.NETHERITE_CHESTPLATE, "§eArmour Trims", "clan panel",
                    List.of("§7Edit on the web panel")),
            new Button(28, Material.IRON_SWORD, "§eStats", "clan info",
                    List.of("§7Season + lifetime K/D")),
            new Button(30, Material.COMPASS, "§eClan List", "clan list",
                    List.of("§7Every clan on the server")),
            new Button(32, Material.ENDER_EYE, "§eWeb Panel", "clan panel",
                    List.of("§7Get a one-time leader link")),
            new Button(34, Material.BARRIER, "§cLeave Clan", "clan leave",
                    List.of("§7Leave your current clan"))
    );

    private ClanMenu() {}

    public static void open(Player player) {
        Holder holder = new Holder();
        Inventory inv = Bukkit.createInventory(holder, 54,
                Component.text("❖ Clan Menu", Msg.ACCENT));
        holder.inventory = inv;

        for (Button b : BUTTONS) {
            ItemStack item = new ItemStack(b.icon());
            ItemMeta meta = item.getItemMeta();
            if (meta != null) {
                meta.displayName(legacy(b.name()));
                meta.lore(b.lore().stream().map(ClanMenu::legacy).toList());
                item.setItemMeta(meta);
            }
            inv.setItem(b.slot(), item);
            holder.routes.put(b.slot(), b.command());
        }
        player.openInventory(inv);
    }

    /** Parse §-prefixed legacy colour into a non-italic Component. */
    private static Component legacy(String s) {
        return net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer
                .legacySection().deserialize(s)
                .decoration(net.kyori.adventure.text.format.TextDecoration.ITALIC, false);
    }
}
