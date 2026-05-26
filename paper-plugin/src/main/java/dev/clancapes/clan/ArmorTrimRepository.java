package dev.clancapes.clan;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.panel.PanelClient;

import java.util.Collections;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import java.util.logging.Level;

/**
 * In-memory cache of {@code (clan, slot) → (material, pattern)} pulled
 * from the panel's {@code /api/plugin/armor-trims} endpoint.
 *
 * <p>Reads (from the equip listener) hit a lock-free
 * {@link AtomicReference} snapshot — every refresh swaps the whole map
 * at once so a half-applied refresh never tears across two snapshots.
 *
 * <p>Cadence: refreshed on plugin enable plus every five minutes from
 * the main scheduler. Same pattern as ClanRepository / BannerRepository.
 */
public final class ArmorTrimRepository {
    public enum Slot { HEAD, CHEST, LEGS, FEET }

    public record TrimSpec(String material, String pattern) {}

    private final ClanCapesPlugin plugin;

    /**
     * Outer key: clan tag UPPER-CASE. Inner: EnumMap keyed by Slot.
     * Replaced wholesale on every refresh — readers grab one snapshot
     * via {@code byTagSlot} and don't need to lock.
     */
    private final AtomicReference<Map<String, EnumMap<Slot, TrimSpec>>> byTagSlot =
            new AtomicReference<>(Map.of());

    public ArmorTrimRepository(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    public Optional<TrimSpec> byTagSlot(String tag, Slot slot) {
        if (tag == null || slot == null) return Optional.empty();
        EnumMap<Slot, TrimSpec> slots = byTagSlot.get().get(tag.toUpperCase());
        if (slots == null) return Optional.empty();
        return Optional.ofNullable(slots.get(slot));
    }

    public int size() {
        int n = 0;
        for (var slots : byTagSlot.get().values()) n += slots.size();
        return n;
    }

    /**
     * Async refresh from {@code GET /api/plugin/armor-trims}. Failures
     * keep the previous cache in place so a transient panel outage
     * doesn't blank applied trims for connected players.
     */
    public void refreshAsync(Runnable onDone) {
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                String panelUrl = plugin.getPluginConfig().getPanelUrl();
                String apiKey = plugin.getPluginConfig().getPanelApiKey();
                if (panelUrl == null || panelUrl.isBlank() || apiKey == null || apiKey.isBlank()) {
                    return;
                }
                Map<String, Object> raw = plugin.getPanelClient()
                        .fetchArmorTrims(panelUrl, apiKey);
                Object trimsObj = raw.get("trims");
                if (!(trimsObj instanceof List<?> trims)) {
                    return;
                }
                Map<String, EnumMap<Slot, TrimSpec>> fresh = new HashMap<>();
                for (Object elem : trims) {
                    if (!(elem instanceof Map<?, ?> row)) continue;
                    Object tagO = row.get("clan");
                    Object slotO = row.get("slot");
                    Object matO = row.get("material");
                    Object patO = row.get("pattern");
                    if (!(tagO instanceof String tag)
                            || !(slotO instanceof String slotStr)
                            || !(matO instanceof String material)
                            || !(patO instanceof String pattern)) {
                        continue;
                    }
                    Slot slot;
                    try {
                        slot = Slot.valueOf(slotStr.toUpperCase());
                    } catch (IllegalArgumentException ignored) {
                        continue;
                    }
                    fresh.computeIfAbsent(tag.toUpperCase(), k -> new EnumMap<>(Slot.class))
                            .put(slot, new TrimSpec(material, pattern));
                }
                byTagSlot.set(Collections.unmodifiableMap(fresh));
                if (plugin.getPluginConfig().isDebugLogging()) {
                    plugin.getLogger().info("[ArmorTrimRepository] refreshed: "
                            + fresh.size() + " clan(s) with trims");
                }
            } catch (PanelClient.PanelException e) {
                plugin.getLogger().log(Level.WARNING,
                        "[ArmorTrimRepository] refresh failed (keeping previous cache): " + e.getMessage());
            } catch (Exception e) {
                plugin.getLogger().log(Level.WARNING,
                        "[ArmorTrimRepository] refresh exception: " + e.getMessage());
            } finally {
                if (onDone != null) onDone.run();
            }
        });
    }
}
