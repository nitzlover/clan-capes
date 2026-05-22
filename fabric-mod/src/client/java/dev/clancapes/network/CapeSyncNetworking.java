package dev.clancapes.network;

import dev.clancapes.ClanCapesClient;
import dev.clancapes.cape.CapeManager;
import dev.clancapes.config.ClanCapesConfig;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayNetworking;
import net.fabricmc.fabric.api.networking.v1.PayloadTypeRegistry;
import net.minecraft.client.Minecraft;

import java.io.ByteArrayInputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.util.UUID;

public final class CapeSyncNetworking {
    private CapeSyncNetworking() {
    }

    public static void register() {
        PayloadTypeRegistry.clientboundPlay().register(CapeSyncPayload.TYPE, CapeSyncPayload.STREAM_CODEC);
        ClientPlayNetworking.registerGlobalReceiver(CapeSyncPayload.TYPE, (payload, context) ->
                context.client().execute(() -> handle(payload.data())));
    }

    private static void handle(byte[] message) {
        if (message == null || message.length == 0) {
            return;
        }

        try (DataInputStream in = new DataInputStream(new ByteArrayInputStream(message))) {
            String action = in.readUTF();
            switch (action) {
                case "config" -> {
                    String apiBaseUrl = in.readUTF();
                    ClanCapesConfig.applyServerApiBaseUrl(apiBaseUrl);
                    CapeManager.get().onWorldJoin();
                }
                case "reload" -> {
                    UUID uuid = new UUID(in.readLong(), in.readLong());
                    CapeManager.get().hotReload(uuid);
                }
                default -> ClanCapesClient.LOGGER.debug("Unknown cape sync action: {}", action);
            }
        } catch (IOException e) {
            ClanCapesClient.LOGGER.warn("Failed to parse cape sync packet", e);
        }
    }

    public static void resolveApiForCurrentConnection(Minecraft client) {
        if (!ClanCapesConfig.get().autoDetectApiFromServer) {
            return;
        }
        if (client.isLocalServer()) {
            return;
        }
        var server = client.getCurrentServer();
        String detected = ClanCapesConfig.resolveFromServerData(server);
        if (detected != null) {
            ClanCapesConfig.setSessionApiBaseUrl(detected);
            ClanCapesClient.LOGGER.info("Clan Capes API auto-detected from server address: {}", detected);
        }
    }
}
