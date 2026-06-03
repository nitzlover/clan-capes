package dev.crestoria.util;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.event.ClickEvent;
import net.kyori.adventure.text.event.HoverEvent;
import net.kyori.adventure.text.format.TextColor;
import net.kyori.adventure.text.format.TextDecoration;

/**
 * Central chat styling so every Crestoria message looks the same: a soft
 * gold "❖ Crestoria" prefix, a calm colour palette, and consistent helpers
 * for clan tags and clickable buttons. Player-facing copy is clean English
 * with no protocol/jargon leakage.
 */
public final class Msg {

    private Msg() {
    }

    public static final TextColor ACCENT = TextColor.color(0xF2C14E); // soft gold
    public static final TextColor OK = TextColor.color(0x86E29B);     // green
    public static final TextColor ERR = TextColor.color(0xF07A75);    // soft red
    public static final TextColor INFO = TextColor.color(0xD9DEE3);   // near-white
    public static final TextColor MUTE = TextColor.color(0x8B9197);   // grey
    public static final TextColor LINK = TextColor.color(0x6FB7FF);   // blue

    /** "❖ Crestoria " prefix prepended to every standalone line. */
    public static Component prefix() {
        return Component.text()
                .append(Component.text("❖ ", ACCENT))
                .append(Component.text("Crestoria ", ACCENT, TextDecoration.BOLD))
                .build();
    }

    public static Component ok(String body) {
        return prefix().append(Component.text(body, OK));
    }

    public static Component err(String body) {
        return prefix().append(Component.text(body, ERR));
    }

    public static Component info(String body) {
        return prefix().append(Component.text(body, INFO));
    }

    /** Prefixed line with an accent-gold clan tag spliced in: "<pre>You joined [TAG]." */
    public static Component infoTag(String before, String tag, String after) {
        return prefix()
                .append(Component.text(before, INFO))
                .append(tag(tag))
                .append(Component.text(after, INFO));
    }

    public static Component okTag(String before, String tag, String after) {
        return prefix()
                .append(Component.text(before, OK))
                .append(tag(tag))
                .append(Component.text(after, OK));
    }

    public static Component errTag(String before, String tag, String after) {
        return prefix()
                .append(Component.text(before, ERR))
                .append(tag(tag))
                .append(Component.text(after, ERR));
    }

    /** A raw (un-prefixed) coloured line — for multi-line bodies and lists. */
    public static Component line(String body, TextColor colour) {
        return Component.text(body, colour);
    }

    /** Bold accent-gold clan tag, e.g. [DAWN]. */
    public static Component tag(String t) {
        return Component.text("[" + t + "]", ACCENT, TextDecoration.BOLD);
    }

    /** Clickable [label] with a hover tooltip. */
    public static Component button(String label, ClickEvent click, String hover) {
        return Component.text("[" + label + "]", LINK, TextDecoration.BOLD)
                .clickEvent(click)
                .hoverEvent(HoverEvent.showText(Component.text(hover, MUTE)));
    }

    /**
     * Turn a raw panel error string into friendly, jargon-free chat copy.
     * Falls back to the original text (already English from the panel) when
     * no nicer phrasing is known.
     */
    public static String friendly(String panelError) {
        if (panelError == null || panelError.isBlank()) {
            return "Something went wrong. Try again in a moment.";
        }
        String e = panelError.toLowerCase();
        if (e.contains("already in a clan")) {
            return "You are already in a clan — use /clan leave first.";
        }
        if (e.contains("already exists")) {
            return "That clan tag is already taken — pick another.";
        }
        if (e.contains("name must be")) {
            return "Clan name must be 1–32 characters.";
        }
        if (e.contains("tag") && (e.contains("invalid") || e.contains("2-6") || e.contains("characters"))) {
            return "Tag must be 2–6 letters or numbers.";
        }
        if (e.contains("palette") || e.contains("colour") || e.contains("color")) {
            if (e.contains("already used")) {
                return "That colour is already used by another clan.";
            }
            return "No clan colours are free right now — ask an admin.";
        }
        if (e.contains("not found")) {
            return "That clan could not be found.";
        }
        if (e.contains("unauthorized") || e.contains("api key") || e.contains("not linked")) {
            return "The server is not linked to the panel — ask an admin.";
        }
        if (e.startsWith("server error") || e.startsWith("api ")) {
            return "Server is busy — please try again.";
        }
        return panelError;
    }
}
