package dev.clancapes.listener;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.sync.CapeSyncChannel;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;

public final class PlayerJoinListener implements Listener {
    private final ClanCapesPlugin plugin;
    private final CapeSyncChannel syncChannel;

    public PlayerJoinListener(ClanCapesPlugin plugin, CapeSyncChannel syncChannel) {
        this.plugin = plugin;
        this.syncChannel = syncChannel;
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        if (!plugin.getPluginConfig().isApiEnabled()) {
            return;
        }
        String publicUrl = plugin.getPluginConfig().getApiPublicUrl();
        syncChannel.sendServerConfig(event.getPlayer(), publicUrl);
    }
}
