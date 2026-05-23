package dev.clancapes.model;

/**
 * One layer in a clan banner. Mirrors the NBT shape the user already knows
 * from vanilla Minecraft banners:
 *
 *   {Color: 14, Pattern: "flo"}
 *
 * Color is the vanilla DyeColor ordinal (0=white .. 15=black) — same
 * numbering used in /give NBT, banner item NBT, and BlockEntityTag.
 * Pattern is the short identifier the vanilla item NBT also uses
 * ("flo", "mc", "gra", ...). The plugin maps it to the modern
 * {@code org.bukkit.block.banner.PatternType} at apply-time via
 * {@code dev.clancapes.util.BannerPatternCodes}.
 */
public record BannerPatternSpec(
        int color,
        String pattern
) {
}
