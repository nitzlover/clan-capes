package dev.clancapes;

import dev.clancapes.cape.CapeManager;
import dev.clancapes.config.ClanCapesConfig;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class ClanCapesClient implements ClientModInitializer {
    public static final Logger LOGGER = LoggerFactory.getLogger(ClanCapesMod.MOD_ID);

    @Override
    public void onInitializeClient() {
        ClanCapesConfig.load();
        CapeManager.get().start();

        ClientTickEvents.END_CLIENT_TICK.register(client -> CapeManager.get().tick());

        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) ->
                CapeManager.get().onWorldJoin());

        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) ->
                CapeManager.get().onWorldLeave());

        LOGGER.info("Clan Capes client initialized (API: {})", ClanCapesConfig.get().apiBaseUrl);
    }
}
