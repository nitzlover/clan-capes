package dev.clancapes.trim;

import dev.clancapes.api.PlayerTrimResponse;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Per-player armour trim state. Keyed by armour slot
 * ({@code head/chest/legs/feet}). Value is the (material, pattern)
 * identifier pair the mixin layer applies at render time.
 *
 * <p>Mirrors {@link dev.clancapes.cape.PlayerCapeState} so the two
 * subsystems lifecycle in parallel under the existing manager pattern.
 */
public final class PlayerTrimState {

    private final UUID uuid;
    private volatile Map<String, PlayerTrimResponse.SlotTrim> slots = Map.of();
    private volatile String clan;
    private volatile long updatedAt;
    private volatile long lastFetchedAtMs;
    private volatile boolean hasTrims;

    public PlayerTrimState(UUID uuid) {
        this.uuid = uuid;
    }

    public void apply(PlayerTrimResponse response) {
        this.lastFetchedAtMs = System.currentTimeMillis();
        if (response == null || !response.hasTrims() || response.trims() == null) {
            this.clan = response == null ? null : response.clan();
            this.slots = Map.of();
            this.hasTrims = false;
            this.updatedAt = response == null ? 0L : response.updatedAt();
            return;
        }
        this.clan = response.clan();
        this.updatedAt = response.updatedAt();
        Map<String, PlayerTrimResponse.SlotTrim> normalised = new HashMap<>();
        for (var entry : response.trims().entrySet()) {
            if (entry.getKey() == null || entry.getValue() == null) continue;
            normalised.put(entry.getKey().toLowerCase(Locale.ROOT), entry.getValue());
        }
        this.slots = Map.copyOf(normalised);
        this.hasTrims = !normalised.isEmpty();
    }

    public Optional<PlayerTrimResponse.SlotTrim> getSlot(String slot) {
        if (!hasTrims || slot == null) return Optional.empty();
        return Optional.ofNullable(slots.get(slot.toLowerCase(Locale.ROOT)));
    }

    public boolean hasTrims() { return hasTrims; }
    public String clan() { return clan; }
    public long updatedAt() { return updatedAt; }
    public long lastFetchedAtMs() { return lastFetchedAtMs; }
    public UUID uuid() { return uuid; }
}
