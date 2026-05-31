package dev.clancapes.listener;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.clancapes.api.dto.BannerDto;
import org.bukkit.DyeColor;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Registry;
import org.bukkit.block.Banner;
import org.bukkit.block.banner.Pattern;
import org.bukkit.block.banner.PatternType;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.BlockStateMeta;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Reusable shield-branding helper. Shared between {@code /clan shield}
 * (manual reapply) and {@link ClanShieldListener} (auto-apply on
 * pickup / hold / swap / join) so the stamping logic, the PDC marker
 * key, and the cleanup policy all live in one place.
 *
 * <h2>Marker policy</h2>
 * Exactly mirrors {@link ClanArmorListener}: a PDC marker
 * ({@link #SHIELD_OWNER_KEY}) is stamped on every shield we brand.
 * The reconcile path treats:
 * <ol>
 *   <li>player in clan, shield with NO marker or DIFFERENT marker
 *       → rewrite to current clan's banner spec.</li>
 *   <li>shield carries OUR marker but the wearer has no banner spec
 *       (left their clan, joined one without a banner, clan disbanded)
 *       → strip the banner + marker.</li>
 *   <li>player without clan, shield without marker → no-op (vanilla
 *       hand-crafted shields survive untouched).</li>
 * </ol>
 */
public final class ClanShieldStamper {

    public static final NamespacedKey SHIELD_OWNER_KEY =
            new NamespacedKey("clancapes", "shield_owner");

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
     * inventory). Returns false if the stack isn't a shield or the
     * banner spec is unusable.
     */
    public static boolean apply(ItemStack shield, BannerDto banner, String clanTag) {
        if (!isShield(shield)) return false;
        if (banner == null) return false;
        if (!(shield.getItemMeta() instanceof BlockStateMeta meta)) return false;

        // Skip the rewrite if the marker already matches — saves the
        // ItemStack mutation churn on every hotbar scroll.
        if (clanTag.equalsIgnoreCase(readMarker(meta))) return false;

        Banner state = (Banner) meta.getBlockState();
        state.setBaseColor(dyeFromOrdinal(banner.baseColor));
        state.setPatterns(parsePatterns(banner));
        state.update();
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

        Banner state = (Banner) meta.getBlockState();
        state.setBaseColor(DyeColor.WHITE);
        state.setPatterns(new ArrayList<>());
        state.update();
        meta.setBlockState(state);
        meta.getPersistentDataContainer().remove(SHIELD_OWNER_KEY);
        shield.setItemMeta(meta);
        return true;
    }

    /**
     * Translate the panel's {@code [{color, pattern}]} JSON array into
     * Bukkit's {@link Pattern} list. Unknown pattern keys are skipped
     * so a single bad layer can't fail the whole stamp.
     */
    private static List<Pattern> parsePatterns(BannerDto banner) {
        List<Pattern> out = new ArrayList<>();
        if (banner.patterns == null || !banner.patterns.isJsonArray()) return out;
        for (JsonElement el : banner.patterns.getAsJsonArray()) {
            if (!el.isJsonObject()) continue;
            JsonObject obj = el.getAsJsonObject();
            if (!obj.has("color") || !obj.has("pattern")) continue;
            int colorOrdinal = obj.get("color").getAsInt();
            String patternKey = obj.get("pattern").getAsString();
            DyeColor color = dyeFromOrdinal(colorOrdinal);
            String normalised = patternKey.contains(":") ? patternKey : "minecraft:" + patternKey;
            NamespacedKey key = NamespacedKey.fromString(normalised.toLowerCase(Locale.ROOT));
            if (key == null) continue;
            PatternType type = Registry.BANNER_PATTERN.get(key);
            if (type == null) continue;
            out.add(new Pattern(color, type));
        }
        return out;
    }

    /** Defensive ordinal lookup — clamp out-of-range to white. */
    private static DyeColor dyeFromOrdinal(int ordinal) {
        DyeColor[] all = DyeColor.values();
        if (ordinal < 0 || ordinal >= all.length) return DyeColor.WHITE;
        return all[ordinal];
    }
}
