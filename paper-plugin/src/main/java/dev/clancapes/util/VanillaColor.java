package dev.clancapes.util;

import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.ChatColor;

/**
 * Snap an arbitrary {@code #RRGGBB} clan colour to the nearest of
 * Minecraft's 16 vanilla {@link NamedTextColor} entries.
 *
 * <p>Background: scoreboard {@code Team.color()} only accepts a
 * {@link NamedTextColor} — passing a 24-bit RGB built via
 * {@code TextColor.color(r,g,b)} silently fails the {@code instanceof}
 * check and the team colour falls back to {@code null}. Same problem
 * downstream: legacy {@code §x§R§R§G§G§B§B} hex codes don't survive
 * a round-trip through MiniMessage (the format LPC / TAB chat-format
 * plugins use), so any placeholder that emits §x bytes renders as
 * literal junk in chat.
 *
 * <p>Fix: keep the operator-set 24-bit hex on {@code clans.color_hex}
 * for admin UI swatches + 3D banner texture, but route every in-game
 * <em>text</em> render through this snap. Result: clan tag, team
 * prefix, /clanc broadcast, PAPI {@code %clancapes_color_prefix%}
 * all render in one of the 16 vanilla §-codes that every chat /
 * scoreboard / TAB plugin understands without translation.
 *
 * <p>Snap is sRGB Euclidean — perceptually weak but fine for this
 * use case where the input is already operator-chosen from a curated
 * palette. OKLAB would be marginally better but adds dependencies
 * for sub-pixel improvement.
 */
public final class VanillaColor {
    private VanillaColor() {}

    /**
     * Snap arbitrary {@code #RRGGBB} hex to the nearest vanilla
     * {@link NamedTextColor}. Returns {@link NamedTextColor#WHITE}
     * for malformed input.
     */
    public static NamedTextColor nearest(String hex) {
        if (hex == null || hex.length() != 7 || hex.charAt(0) != '#') {
            return NamedTextColor.WHITE;
        }
        int r, g, b;
        try {
            r = Integer.parseInt(hex.substring(1, 3), 16);
            g = Integer.parseInt(hex.substring(3, 5), 16);
            b = Integer.parseInt(hex.substring(5, 7), 16);
        } catch (NumberFormatException e) {
            return NamedTextColor.WHITE;
        }
        NamedTextColor best = NamedTextColor.WHITE;
        long bestDist = Long.MAX_VALUE;
        // Adventure exposes the 16 vanilla colours via NAMES.values();
        // iterating once at call time is O(16) and trivial.
        for (NamedTextColor candidate : NamedTextColor.NAMES.values()) {
            int v = candidate.value();
            int vr = (v >> 16) & 0xff;
            int vg = (v >> 8) & 0xff;
            int vb = v & 0xff;
            long dr = r - vr;
            long dg = g - vg;
            long db = b - vb;
            long dist = dr * dr + dg * dg + db * db;
            if (dist < bestDist) {
                bestDist = dist;
                best = candidate;
            }
        }
        return best;
    }

    /**
     * Legacy {@code §<code>} prefix corresponding to the
     * {@link #nearest(String)} snap. Built on top of Bukkit's
     * {@link ChatColor} so plugins that consume the {@code §}-coded
     * string survive both vanilla chat AND MiniMessage's
     * {@code <reset>} re-serialisation (which strips {@code §x} hex
     * but preserves the 16 single-character §-codes).
     */
    public static String legacyPrefix(String hex) {
        NamedTextColor named = nearest(hex);
        ChatColor bukkit = toBukkit(named);
        return "§" + bukkit.getChar();
    }

    /**
     * Same mapping as {@link #legacyPrefix(String)} but returns the
     * raw char (e.g. {@code 'c'} for red) — useful for callers that
     * want to assemble the {@code §} prefix themselves.
     */
    public static char legacyChar(String hex) {
        return toBukkit(nearest(hex)).getChar();
    }

    private static ChatColor toBukkit(NamedTextColor named) {
        // NamedTextColor.toString() returns lowercase ("dark_red"),
        // ChatColor.valueOf() needs uppercase — convert.
        try {
            return ChatColor.valueOf(named.toString().toUpperCase());
        } catch (IllegalArgumentException e) {
            return ChatColor.WHITE;
        }
    }
}
