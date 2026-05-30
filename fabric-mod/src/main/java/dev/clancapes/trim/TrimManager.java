package dev.clancapes.trim;

import dev.clancapes.ClanCapesClient;
import dev.clancapes.api.PlayerTrimResponse;
import dev.clancapes.api.TrimApiClient;
import dev.clancapes.config.ClanCapesConfig;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.world.entity.player.Player;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Lifecycle twin of {@link dev.clancapes.cape.CapeManager} for armour
 * trims. Holds a per-player snapshot, refreshes on a fixed interval +
 * world-join trigger, and exposes a slot lookup for the armour-layer
 * mixin to query at render time.
 *
 * <p>No texture cache here — trim materials/patterns are vanilla data
 * identifiers, not external PNGs. Render-side cost is whatever the
 * vanilla armour-trim path already costs once an {@code ArmorTrim}
 * data component is attached to the stack.
 */
public final class TrimManager {
    private static final TrimManager INSTANCE = new TrimManager();

    private final ExecutorService ioExecutor = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "clancapes-trim-io");
        t.setDaemon(true);
        return t;
    });

    private final TrimApiClient apiClient = new TrimApiClient(ioExecutor);
    private final Map<UUID, PlayerTrimState> states = new ConcurrentHashMap<>();
    private long tickCounter;

    public static TrimManager get() {
        return INSTANCE;
    }

    public void start() {
        ClanCapesClient.LOGGER.info("TrimManager started");
    }

    public void tick() {
        Minecraft client = Minecraft.getInstance();
        if (client.level == null || client.player == null) return;

        tickCounter++;
        int refreshSec = Math.max(15, ClanCapesConfig.get().refreshIntervalSeconds);
        long refreshTicks = refreshSec * 20L;
        if (tickCounter % refreshTicks != 0) return;

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
    }

    public void refreshPlayer(UUID uuid, boolean force) {
        PlayerTrimState state = states.computeIfAbsent(uuid, PlayerTrimState::new);
        if (!force && state.lastFetchedAtMs() > 0
                && System.currentTimeMillis() - state.lastFetchedAtMs()
                < ClanCapesConfig.get().refreshIntervalSeconds * 1000L) {
            return;
        }
        apiClient.fetchPlayer(uuid).thenAccept(state::apply);
    }

    public PlayerTrimState getState(UUID uuid) {
        PlayerTrimState state = states.get(uuid);
        if (state == null) {
            refreshPlayer(uuid, false);
            return states.computeIfAbsent(uuid, PlayerTrimState::new);
        }
        return state;
    }

    public Optional<PlayerTrimResponse.SlotTrim> getSlot(AbstractClientPlayer player, String slot) {
        return getState(player.getUUID()).getSlot(slot);
    }

    public void shutdown() {
        ioExecutor.shutdown();
        try {
            ioExecutor.awaitTermination(3, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    /**
     * Mapping of {@code EquipmentSlot} ordinals / names to our flat
     * {@code head/chest/legs/feet} keys. Centralised here so the mixin
     * stays free of vanilla enum imports (the mixin runs against a
     * dynamic class signature that's harder to keep in sync).
     */
    public static String slotName(int armorSlotIndex) {
        // Vanilla armour iteration order: feet, legs, chest, head.
        return switch (armorSlotIndex) {
            case 0 -> "feet";
            case 1 -> "legs";
            case 2 -> "chest";
            case 3 -> "head";
            default -> "";
        };
    }
}
