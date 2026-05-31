package dev.clancapes.listener;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.api.dto.BannerDto;
import org.bukkit.DyeColor;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Registry;
import org.bukkit.block.Banner;
import org.bukkit.block.banner.Pattern;
import org.bukkit.block.banner.PatternType;
import org.bukkit.block.BlockState;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.BlockStateMeta;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Reusable shield-branding helper shared between {@code /clan shield}
 * (manual reapply) and {@link ClanShieldListener} (auto-apply).
 *
 * <h2>1.0.9 — pattern-key mapping fix</h2>
 * The panel stores banner pattern layers using legacy Bukkit short
 * codes ({@code bri}, {@code bo}, {@code cra}, …). MC 26's
 * {@code Registry.BANNER_PATTERN} keys those entries by full
 * snake-case names ({@code minecraft:bricks},
 * {@code minecraft:border}, {@code minecraft:creeper}). Looking the
 * short codes up directly returned null for every layer, the
 * resulting pattern list was empty, the stamper happily set
 * baseColor + empty patterns and stamped the PDC marker — every
 * branded shield came out plain white and the marker locked
 * subsequent reconciles into a no-op.
 *
 * <p>Fix is two-layered:
 * <ol>
 *   <li>{@link #LEGACY_TO_MODERN_KEY} maps the panel's short codes
 *       to MC 26 registry keys, fed by {@link #resolvePatternType}
 *       before the registry lookup.</li>
 *   <li>{@link #apply} now refuses to stamp the marker (and returns
 *       false) when the banner spec declares pattern layers but
 *       every one of them failed to resolve. That leaves the
 *       shield untouched so the next reconcile pass retries once
 *       the mapping is corrected — instead of permanently branding
 *       a white shield that the short-circuit can't recover.</li>
 * </ol>
 */
public final class ClanShieldStamper {

    public static final NamespacedKey SHIELD_OWNER_KEY =
            new NamespacedKey("clancapes", "shield_owner");

    /**
     * Panel→registry pattern key bridge. Built from the panel's
     * {@code BANNER_PATTERNS} list at {@code src/lib/banners.ts}.
     * Codes the registry still accepts as-is (none, at time of
     * writing) would resolve via the direct path in
     * {@link #resolvePatternType}; everything in this map needs the
     * translation.
     */
    private static final Map<String, String> LEGACY_TO_MODERN_KEY = Map.<String, String>ofEntries(
            Map.entry("bo", "border"),
            Map.entry("bri", "bricks"),
            Map.entry("bt", "triangle_bottom"),
            Map.entry("bts", "triangles_bottom"),
            Map.entry("cbo", "curly_border"),
            Map.entry("cr", "cross"),
            Map.entry("cra", "creeper"),
            Map.entry("cre", "creeper"),
            Map.entry("cs", "stripe_center"),
            Map.entry("dls", "diagonal_left"),
            Map.entry("drs", "diagonal_right"),
            Map.entry("flo", "flower"),
            Map.entry("flw", "flow"),
            Map.entry("glb", "globe"),
            Map.entry("gra", "gradient"),
            Map.entry("gru", "gradient_up"),
            Map.entry("gus", "guster"),
            Map.entry("hh", "half_horizontal"),
            Map.entry("hhb", "half_horizontal_bottom"),
            Map.entry("ld", "diagonal_up_left"),
            Map.entry("lud", "diagonal_up_left"),
            Map.entry("mc", "mojang"),
            Map.entry("moj", "mojang"),
            Map.entry("mr", "rhombus"),
            Map.entry("ms", "stripe_downright"),
            Map.entry("msb", "stripe_middle"),
            Map.entry("mss", "small_stripes"),
            Map.entry("pig", "piglin"),
            Map.entry("rd", "diagonal_right"),
            Map.entry("rs", "stripe_right"),
            Map.entry("rud", "diagonal_up_right"),
            Map.entry("sc", "square_top_left"),
            Map.entry("sku", "skull"),
            Map.entry("ss", "straight_cross"),
            Map.entry("tl", "stripe_top"),
            Map.entry("tr", "triangle_top"),
            Map.entry("ts", "stripe_left"),
            Map.entry("tt", "triangle_top"),
            Map.entry("tts", "triangles_top"),
            Map.entry("vh", "half_vertical"),
            Map.entry("vhr", "half_vertical_right"),
            Map.entry("bl", "square_bottom_left"),
            Map.entry("br", "square_bottom_right")
    );

    private ClanShieldStamper() {}

    /** Quick predicate the listener uses to skip non-shield slots. */
    public static boolean isShield(ItemStack stack) {
        return stack != null && stack.getType() == Material.SHIELD;
    }

    public static String readMarker(BlockStateMeta meta) {
        PersistentDataContainer pdc = meta.getPersistentDataContainer();
        return pdc.has(SHIELD_OWNER_KEY, PersistentDataType.STRING)
                ? pdc.get(SHIELD_OWNER_KEY, PersistentDataType.STRING)
                : null;
    }

    /**
     * Stamp the clan banner spec onto a shield. Returns true on a
     * successful mutation (caller writes the stack back to the
     * inventory). Returns false when:
     * <ul>
     *   <li>the stack isn't a shield;</li>
     *   <li>the meta is not a {@link BlockStateMeta} (Paper API
     *       drift);</li>
     *   <li>the banner spec declares pattern layers but every layer
     *       failed to resolve to a registry key — refusing to stamp
     *       a permanently-white shield with an owner marker;</li>
     *   <li>the existing marker already matches and the current
     *       NBT is up to date (short-circuit).</li>
     * </ul>
     */
    public static boolean apply(ItemStack shield, BannerDto banner, String clanTag) {
        return apply(shield, banner, clanTag, null);
    }

    /**
     * Same as {@link #apply(ItemStack, BannerDto, String)} but lets
     * the caller pass the plugin in for a warn-log path. Unknown
     * pattern keys produce a single warning per call so an operator
     * sees what the panel sent.
     */
    public static boolean apply(ItemStack shield, BannerDto banner, String clanTag,
                                ClanCapesPlugin plugin) {
        if (!isShield(shield)) return false;
        if (banner == null) return false;
        if (!(shield.getItemMeta() instanceof BlockStateMeta meta)) return false;

        // Short-circuit on matching marker — saves the ItemStack
        // mutation churn on every hotbar scroll. Do NOT short-circuit
        // if there's no marker yet, even if the spec happens to match
        // some inherited vanilla shield meta.
        if (clanTag.equalsIgnoreCase(readMarker(meta))) return false;

        BlockState rawState = meta.getBlockState();
        if (!(rawState instanceof Banner state)) return false;

        int requestedLayers = countRequestedLayers(banner);
        List<Pattern> parsed = parsePatterns(banner, plugin);
        if (requestedLayers > 0 && parsed.isEmpty()) {
            // Every pattern key failed to resolve. Refuse the stamp so
            // the next reconcile retries once the mapping is fixed
            // instead of branding a permanent white shield.
            if (plugin != null) {
                plugin.getLogger().warning("[shield] refusing to stamp [" + clanTag
                        + "] banner — " + requestedLayers
                        + " pattern layer(s) requested but none resolved (see legacy-key map)");
            }
            return false;
        }

        state.setBaseColor(dyeFromOrdinal(banner.baseColor));
        state.setPatterns(parsed);
        meta.setBlockState(state);
        meta.getPersistentDataContainer().set(
                SHIELD_OWNER_KEY, PersistentDataType.STRING, clanTag);
        shield.setItemMeta(meta);
        return true;
    }

    /**
     * Strip our banner spec from a shield only if it carries our PDC
     * marker. Vanilla shields without the marker are never touched.
     * Returns true if a strip actually happened.
     */
    public static boolean stripIfOurs(ItemStack shield) {
        if (!isShield(shield)) return false;
        if (!(shield.getItemMeta() instanceof BlockStateMeta meta)) return false;
        if (readMarker(meta) == null) return false;
        if (!(meta.getBlockState() instanceof Banner state)) return false;

        state.setBaseColor(DyeColor.WHITE);
        state.setPatterns(new ArrayList<>());
        meta.setBlockState(state);
        meta.getPersistentDataContainer().remove(SHIELD_OWNER_KEY);
        shield.setItemMeta(meta);
        return true;
    }

    private static int countRequestedLayers(BannerDto banner) {
        if (banner.patterns == null || !banner.patterns.isJsonArray()) return 0;
        return banner.patterns.getAsJsonArray().size();
    }

    /**
     * Translate the panel's {@code [{color, pattern}]} JSON array into
     * Bukkit's {@link Pattern} list. Layers whose pattern key fails
     * to resolve are skipped and (when a plugin handle is available)
     * logged at WARN — they used to silently disappear, which is what
     * left every branded shield plain white.
     */
    private static List<Pattern> parsePatterns(BannerDto banner, ClanCapesPlugin plugin) {
        List<Pattern> out = new ArrayList<>();
        if (banner.patterns == null || !banner.patterns.isJsonArray()) return out;
        for (JsonElement el : banner.patterns.getAsJsonArray()) {
            if (el == null || el.isJsonNull() || !el.isJsonObject()) continue;
            JsonObject obj = el.getAsJsonObject();
            if (!obj.has("color") || !obj.has("pattern")) continue;
            JsonElement colorEl = obj.get("color");
            JsonElement patternEl = obj.get("pattern");
            if (colorEl == null || colorEl.isJsonNull()) continue;
            if (patternEl == null || patternEl.isJsonNull()) continue;
            int colorOrdinal = colorEl.getAsInt();
            String patternKey = patternEl.getAsString();
            DyeColor color = dyeFromOrdinal(colorOrdinal);
            PatternType type = resolvePatternType(patternKey);
            if (type == null) {
                if (plugin != null) {
                    plugin.getLogger().warning("[shield] unknown banner pattern key '"
                            + patternKey + "' — skipped");
                }
                continue;
            }
            out.add(new Pattern(color, type));
        }
        return out;
    }

    /**
     * Look up a {@link PatternType} by the panel's pattern key. The
     * key is fed through {@link #LEGACY_TO_MODERN_KEY} first (the
     * panel still uses Bukkit's pre-1.21 short codes) and falls back
     * to a direct namespace+key registry lookup so future panel
     * migrations to MC 26 keys work without a plugin change.
     */
    private static PatternType resolvePatternType(String panelKey) {
        if (panelKey == null || panelKey.isBlank()) return null;
        String lowered = panelKey.toLowerCase(Locale.ROOT);

        // Already-namespaced inputs go straight to the registry.
        if (lowered.contains(":")) {
            NamespacedKey direct = NamespacedKey.fromString(lowered);
            return direct == null ? null : Registry.BANNER_PATTERN.get(direct);
        }

        // 1) try the panel's legacy code in our translation map.
        String translated = LEGACY_TO_MODERN_KEY.get(lowered);
        if (translated != null) {
            PatternType viaMap = Registry.BANNER_PATTERN.get(
                    NamespacedKey.minecraft(translated));
            if (viaMap != null) return viaMap;
        }

        // 2) registry might already accept the bare key as-is
        //    (covers a future panel migration sending full names).
        PatternType viaBare = Registry.BANNER_PATTERN.get(
                NamespacedKey.minecraft(lowered));
        return viaBare; // null when nothing resolved
    }

    /** Defensive ordinal lookup — clamp out-of-range to white. */
    private static DyeColor dyeFromOrdinal(int ordinal) {
        DyeColor[] all = DyeColor.values();
        if (ordinal < 0 || ordinal >= all.length) return DyeColor.WHITE;
        return all[ordinal];
    }
}
