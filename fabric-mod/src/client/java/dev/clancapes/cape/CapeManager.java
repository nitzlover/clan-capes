package dev.clancapes.cape;

import com.mojang.blaze3d.platform.NativeImage;
import dev.clancapes.ClanCapesClient;
import dev.clancapes.api.CapeApiClient;
import dev.clancapes.api.PlayerCapeResponse;
import dev.clancapes.config.ClanCapesConfig;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.Player;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

public final class CapeManager {
    private static final CapeManager INSTANCE = new CapeManager();

    private final ExecutorService ioExecutor = Executors.newFixedThreadPool(
            Math.max(2, ClanCapesConfig.get().maxConcurrentDownloads),
            r -> {
                Thread t = new Thread(r, "clancapes-io");
                t.setDaemon(true);
                return t;
            });

    private final CapeApiClient apiClient = new CapeApiClient(ioExecutor);
    private final CapeDownloader downloader = new CapeDownloader(ioExecutor);
    private final CapeTextureCache textureCache = new CapeTextureCache(
            FabricLoader.getInstance().getConfigDir().resolve("clancapes-cache"));

    private final Map<UUID, PlayerCapeState> states = new ConcurrentHashMap<>();
    private long tickCounter;

    public static CapeManager get() {
        return INSTANCE;
    }

    public void start() {
        ClanCapesClient.LOGGER.info("CapeManager started");
    }

    public void tick() {
        Minecraft client = Minecraft.getInstance();
        if (client.level == null || client.player == null) {
            return;
        }

        tickCounter++;
        int refreshSec = Math.max(5, ClanCapesConfig.get().refreshIntervalSeconds);
        long refreshTicks = refreshSec * 20L;
        if (tickCounter % refreshTicks != 0) {
            return;
        }

        for (Player player : client.level.players()) {
            if (player instanceof AbstractClientPlayer) {
                refreshPlayer(player.getUUID(), false);
            }
        }
    }

    public void onWorldJoin() {
        tickCounter = 0;
        Minecraft client = Minecraft.getInstance();
        if (client.level != null) {
            for (Player player : client.level.players()) {
                refreshPlayer(player.getUUID(), true);
            }
        }
    }

    public void onWorldLeave() {
        states.clear();
        textureCache.clearAll();
    }

    public void refreshPlayer(UUID uuid, boolean force) {
        PlayerCapeState state = states.computeIfAbsent(uuid, PlayerCapeState::new);
        if (!force && state.lastFetchedAtMs() > 0
                && System.currentTimeMillis() - state.lastFetchedAtMs()
                < ClanCapesConfig.get().refreshIntervalSeconds * 1000L) {
            ensureTextureLoaded(state);
            return;
        }

        long previousUpdatedAt = state.updatedAt();
        apiClient.fetchPlayer(uuid).thenAccept(response -> {
            if (response.updatedAt() != 0 && response.updatedAt() != previousUpdatedAt) {
                if (state.capeUrl() != null) {
                    textureCache.invalidate(state.capeUrl());
                }
            }
            state.applyApi(response);
            if (!response.hasCape() || response.capeUrl() == null || response.capeUrl().isBlank()) {
                state.clear();
                if (response.updatedAt() == 0) {
                    return;
                }
            }
            ensureTextureLoaded(state);
        });
    }

    public void hotReload(UUID uuid) {
        PlayerCapeState state = states.get(uuid);
        if (state != null && state.capeUrl() != null) {
            textureCache.invalidate(state.capeUrl());
        }
        refreshPlayer(uuid, true);
    }

    private void ensureTextureLoaded(PlayerCapeState state) {
        if (!state.hasCape() || state.capeUrl() == null || state.capeUrl().isBlank()) {
            return;
        }

        String url = state.capeUrl();
        if (!state.needsTextureReload()) {
            Identifier existing = textureCache.getCachedIdentifier(url);
            if (existing != null && !textureCache.isExpired(url)) {
                state.setTextureId(existing);
                return;
            }
        }

        Identifier cached = textureCache.getCachedIdentifier(url);
        if (cached != null && !textureCache.isExpired(url)) {
            state.setTextureId(cached);
            state.markTextureApplied();
            return;
        }

        try {
            NativeImage disk = textureCache.loadFromDisk(url);
            if (disk != null) {
                scheduleRegister(state, url, disk);
                return;
            }
        } catch (Exception e) {
            ClanCapesClient.LOGGER.debug("Disk cache miss for {}", url);
        }

        downloader.download(url).thenAccept(image -> {
            if (image == null) {
                return;
            }
            try {
                textureCache.saveToDisk(url, image);
            } catch (Exception e) {
                ClanCapesClient.LOGGER.debug("Failed to persist cape cache", e);
            }
            scheduleRegister(state, url, image);
        });
    }

    private void scheduleRegister(PlayerCapeState state, String url, NativeImage image) {
        Minecraft.getInstance().execute(() -> {
            try {
                Identifier id = textureCache.registerOnRenderThread(url, image);
                state.setTextureId(id);
                state.markTextureApplied();
            } catch (Exception e) {
                image.close();
                ClanCapesClient.LOGGER.warn("Failed to register cape texture", e);
            }
        });
    }

    public PlayerCapeState getState(UUID uuid) {
        PlayerCapeState state = states.get(uuid);
        if (state == null) {
            refreshPlayer(uuid, false);
            return states.computeIfAbsent(uuid, PlayerCapeState::new);
        }
        return state;
    }

    public Identifier getCapeTexture(AbstractClientPlayer player) {
        PlayerCapeState state = getState(player.getUUID());
        if (!state.hasCape()) {
            return null;
        }
        return state.textureId();
    }

    public boolean shouldRenderClanCape(AbstractClientPlayer player) {
        PlayerCapeState state = getState(player.getUUID());
        return state.hasCape() && state.textureId() != null;
    }

    public void shutdown() {
        ioExecutor.shutdown();
        try {
            ioExecutor.awaitTermination(3, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }
}
