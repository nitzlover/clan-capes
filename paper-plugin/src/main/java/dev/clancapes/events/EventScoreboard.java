package dev.clancapes.events;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.scoreboard.Criteria;
import org.bukkit.scoreboard.DisplaySlot;
import org.bukkit.scoreboard.Objective;
import org.bukkit.scoreboard.Scoreboard;

import java.util.ArrayList;
import java.util.List;

/**
 * Side-panel scoreboard shown to every online player during an
 * event. Rebuilt each update with the current stage, remaining time,
 * participant + alive-clan counts, and the leading clan.
 *
 * <p>Uses a single shared {@link Scoreboard} assigned to all online
 * players so the panel is identical for everyone (it's a spectacle,
 * not per-player private state). On {@link #clear()} players are
 * handed back the main scoreboard so the panel disappears cleanly.
 *
 * <p>Line ordering: Bukkit sorts entries by score descending, so we
 * assign descending scores top-to-bottom. Blank spacers use
 * distinct invisible strings so duplicate-entry collisions don't
 * collapse them.
 */
public final class EventScoreboard {

    private final Scoreboard board;
    private final Objective objective;

    /**
     * @param title legacy-colored title string ("§6§lAIRDROP" / "§b§lKING OF THE HILL")
     */
    public EventScoreboard(String title) {
        this.board = Bukkit.getScoreboardManager().getNewScoreboard();
        this.objective = board.registerNewObjective("ccevent", Criteria.DUMMY,
                net.kyori.adventure.text.Component.text(title));
        this.objective.setDisplaySlot(DisplaySlot.SIDEBAR);
    }

    /**
     * Re-render the panel. {@code lines} are top-to-bottom; this
     * assigns descending scores so Bukkit shows them in order. Cheap
     * enough to call once a second from the event tick.
     */
    public void render(List<String> lines) {
        // Wipe prior entries — simplest correct approach for a panel
        // that changes shape (counts, leader) between ticks.
        for (String entry : new ArrayList<>(board.getEntries())) {
            board.resetScores(entry);
        }
        int score = lines.size();
        int spacer = 0;
        for (String line : lines) {
            String entry = line.isEmpty() ? spacerString(spacer++) : line;
            objective.getScore(entry).setScore(score--);
        }
        // Push to everyone online.
        for (Player p : Bukkit.getOnlinePlayers()) {
            p.setScoreboard(board);
        }
    }

    /** Restore the main scoreboard for everyone — hides the panel. */
    public void clear() {
        Scoreboard main = Bukkit.getScoreboardManager().getMainScoreboard();
        for (Player p : Bukkit.getOnlinePlayers()) {
            p.setScoreboard(main);
        }
    }

    /** Distinct invisible blank line using colour-code padding. */
    private static String spacerString(int n) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i <= n && i < 8; i++) sb.append("§").append(i);
        return sb.toString();
    }
}
