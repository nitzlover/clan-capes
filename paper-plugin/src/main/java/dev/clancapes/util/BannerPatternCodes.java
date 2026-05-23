package dev.clancapes.util;

import org.bukkit.DyeColor;
import org.bukkit.NamespacedKey;
import org.bukkit.Registry;
import org.bukkit.block.banner.Pattern;
import org.bukkit.block.banner.PatternType;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Maps the short pattern codes the admin panel sends (and the codes used
 * in vanilla pre-1.21 banner NBT — "flo", "mc", "gra", ...) to the modern
 * Paper {@link PatternType} registry.
 *
 * Paper still ships {@link PatternType#getByIdentifier(String)} as a
 * deprecated convenience, but the API is fragile across versions, so we
 * keep our own explicit table. Anything missing falls back to the modern
 * registry lookup ({@code minecraft:<key>}) so adding a new pattern just
 * means appending one entry below.
 */
public final class BannerPatternCodes {
    private BannerPatternCodes() {
    }

    private static final Map<String, String> CODE_TO_KEY = new HashMap<>();

    static {
        // Mojang short code → modern registry key (assets/minecraft/banner_pattern/<key>.json).
        CODE_TO_KEY.put("b", "base");
        CODE_TO_KEY.put("bo", "border");
        CODE_TO_KEY.put("bri", "bricks");
        CODE_TO_KEY.put("bt", "triangle_bottom");
        CODE_TO_KEY.put("bts", "triangles_bottom");
        CODE_TO_KEY.put("cbo", "curly_border");
        CODE_TO_KEY.put("cr", "cross");
        CODE_TO_KEY.put("cra", "creeper");
        CODE_TO_KEY.put("cre", "creeper");
        CODE_TO_KEY.put("cs", "stripe_center");
        CODE_TO_KEY.put("dls", "diagonal_left");
        CODE_TO_KEY.put("drs", "diagonal_up_right");
        CODE_TO_KEY.put("flo", "flower");
        CODE_TO_KEY.put("glb", "globe");
        CODE_TO_KEY.put("gra", "gradient");
        CODE_TO_KEY.put("gru", "gradient_up");
        CODE_TO_KEY.put("hh", "half_horizontal");
        CODE_TO_KEY.put("hhb", "half_horizontal_bottom");
        CODE_TO_KEY.put("ld", "diagonal_up_left");
        CODE_TO_KEY.put("lud", "diagonal_right");
        CODE_TO_KEY.put("mc", "mojang");
        CODE_TO_KEY.put("mr", "rhombus");
        CODE_TO_KEY.put("ms", "stripe_downleft");
        CODE_TO_KEY.put("msb", "stripe_middle");
        CODE_TO_KEY.put("mss", "small_stripes");
        CODE_TO_KEY.put("rd", "diagonal_right_mirror");
        CODE_TO_KEY.put("rs", "stripe_right");
        CODE_TO_KEY.put("rud", "stripe_downright");
        CODE_TO_KEY.put("sc", "square_bottom_left");
        CODE_TO_KEY.put("sku", "skull");
        CODE_TO_KEY.put("ss", "straight_cross");
        CODE_TO_KEY.put("tl", "stripe_top");
        CODE_TO_KEY.put("tr", "triangle_top");
        CODE_TO_KEY.put("ts", "stripe_left");
        CODE_TO_KEY.put("tts", "triangles_top");
        CODE_TO_KEY.put("vh", "half_vertical");
        CODE_TO_KEY.put("vhr", "half_vertical_right");
        CODE_TO_KEY.put("sbl", "square_bottom_left");
        CODE_TO_KEY.put("sbr", "square_bottom_right");
        CODE_TO_KEY.put("stl", "square_top_left");
        CODE_TO_KEY.put("str", "square_top_right");
        CODE_TO_KEY.put("flw", "flow");
        CODE_TO_KEY.put("gus", "guster");
        CODE_TO_KEY.put("pig", "piglin");
        // Some hand-written NBT samples use "tt" — treat it as a synonym for
        // the single top triangle (same shape "tr" produces).
        CODE_TO_KEY.put("tt", "triangle_top");
    }

    /**
     * Resolve a panel-supplied pattern token to a Paper {@link PatternType}.
     * Accepts either the legacy short code ("flo") or the modern registry
     * key ("flower"). Returns {@link Optional#empty()} if neither lookup works.
     */
    public static Optional<PatternType> resolveType(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        String normalised = token.trim().toLowerCase();

        // Try short code mapping first — that's what the panel sends today
        // and what the user's existing pattern PNG asset names use.
        String key = CODE_TO_KEY.get(normalised);
        if (key == null) {
            // Caller may have supplied the long form directly.
            key = normalised;
        }
        try {
            PatternType type = Registry.BANNER_PATTERN.get(NamespacedKey.minecraft(key));
            if (type != null) {
                return Optional.of(type);
            }
        } catch (Throwable ignored) {
        }
        // Last resort: ask Paper to interpret it as a legacy identifier.
        try {
            @SuppressWarnings("deprecation")
            PatternType legacy = PatternType.getByIdentifier(normalised);
            return Optional.ofNullable(legacy);
        } catch (Throwable ignored) {
            return Optional.empty();
        }
    }

    /**
     * Build a fully resolved {@link Pattern} (color + type) from a panel
     * spec entry. Returns {@link Optional#empty()} when either the colour
     * ordinal is out of range or the pattern token cannot be mapped — so
     * the caller can simply skip the layer rather than blowing up the
     * whole banner.
     */
    public static Optional<Pattern> resolvePattern(int colorOrdinal, String token) {
        DyeColor[] colours = DyeColor.values();
        if (colorOrdinal < 0 || colorOrdinal >= colours.length) {
            return Optional.empty();
        }
        return resolveType(token).map(t -> new Pattern(colours[colorOrdinal], t));
    }
}
