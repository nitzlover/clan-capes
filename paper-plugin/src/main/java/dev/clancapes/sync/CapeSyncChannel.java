package dev.clancapes.sync;

import dev.clancapes.ClanCapesPlugin;
import org.bukkit.entity.Player;
import org.bukkit.plugin.messaging.PluginMessageListener;

import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.UUID;

public final class CapeSyncChannel implements PluginMessageListener {
    public static final String CHANNEL = "clancapes:sync";

    private final ClanCapesPlugin plugin;

    public CapeSyncChannel(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    public void register() {
        plugin.getServer().getMessenger().registerOutgoingPluginChannel(plugin, CHANNEL);
        plugin.getServer().getMessenger().registerIncomingPluginChannel(plugin, CHANNEL, this);
    }

    public void broadcastReload(Collection<? extends Player> players) {
        for (Player player : players) {
            sendReload(player, player.getUniqueId());
        }
    }

    public void sendReload(Player player, UUID targetUuid) {
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            DataOutputStream out = new DataOutputStream(bytes);
            out.writeUTF("reload");
            out.writeLong(targetUuid.getMostSignificantBits());
            out.writeLong(targetUuid.getLeastSignificantBits());
            player.sendPluginMessage(plugin, CHANNEL, bytes.toByteArray());
        } catch (IOException e) {
            plugin.getLogger().warning("Failed to send cape sync: " + e.getMessage());
        }
    }

    @Override
    public void onPluginMessageReceived(String channel, Player player, byte[] message) {
        // Server is sender only for reload packets
    }
}
