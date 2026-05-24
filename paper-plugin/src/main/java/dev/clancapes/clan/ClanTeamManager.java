package dev.clancapes.clan;

import dev.clancapes.ClanCapesPlugin;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextColor;
import org.bukkit.Bukkit;
import org.bukkit.scoreboard.Scoreboard;
import org.bukkit.scoreboard.Team;

import java.util.HashSet;
import java.util.Set;

/**
 * Owns the vanilla scoreboard teams that render the clan tag prefix
 * above each member's head + in TAB + in chat.
 * <p>
 * Vanilla scoreboard teams are the lowest-friction way to colour and
 * prefix every clan member's nametag — no packets, no PaperMC API
 * tricks. One team per clan, named {@code clan_<TAG>} so the
 * namespace doesn't collide with whatever else might be running.
 * <p>
 * Refreshed whenever {@link ClanRepository} refreshes. The whole
 * thing is idempotent: teams are reset wholesale on every sync so we
 * don't have to track diffs.
 */
public final class ClanTeamManager {
    private static final String TEAM_PREFIX = "clan_";

    private final ClanCapesPlugin plugin;

    public ClanTeamManager(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    /**
     * Rebuild every clan_<TAG> team from the current ClanRepository
     * snapshot. Run on the main thread (scoreboard API isn't thread-
     * safe). Cheap enough to run unconditionally on every refresh —
     * Bukkit silently no-ops register/unregister calls for already-
     * matching state, but we explicitly diff at the entry level so
     * fewer packets fly out.
     */
    public void sync() {
        Scoreboard board = Bukkit.getScoreboardManager().getMainScoreboard();
        ClanRepository repo = plugin.getClanRepository();
        if (repo == null) return;

        Set<String> wantedTeamNames = new HashSet<>();
        for (Clan c : repo.all()) {
            String teamName = TEAM_PREFIX + c.tag().toUpperCase();
            wantedTeamNames.add(teamName);
            Team team = board.getTeam(teamName);
            if (team == null) team = board.registerNewTeam(teamName);

            // Prefix: "[TAG] " in the clan's color. Adventure handles
            // the legacy serialiser so chat plugins that don't know
            // about modern components still see something sensible.
            TextColor color = parseColor(c.colorHex());
            team.prefix(Component.text("[" + c.tag() + "] ", color));
            team.color(color != null && color instanceof NamedTextColor named ? named : null);

            // Diff the entries — Bukkit's Team accepts string entries
            // (player names for online + offline). Remove anyone who
            // shouldn't be here, then add the ones who should.
            Set<String> wanted = new HashSet<>();
            for (ClanMember m : c.members()) wanted.add(m.playerName());
            for (String entry : new HashSet<>(team.getEntries())) {
                if (!wanted.contains(entry)) team.removeEntry(entry);
            }
            for (String entry : wanted) {
                if (!team.hasEntry(entry)) team.addEntry(entry);
            }
        }

        // Sweep stale clan_* teams (clans that have been disbanded).
        for (Team t : new HashSet<>(board.getTeams())) {
            if (t.getName().startsWith(TEAM_PREFIX) && !wantedTeamNames.contains(t.getName())) {
                t.unregister();
            }
        }
    }

    /** Tear down every clan_* team on disable so we don't leak state across reloads. */
    public void shutdown() {
        Scoreboard board = Bukkit.getScoreboardManager().getMainScoreboard();
        for (Team t : new HashSet<>(board.getTeams())) {
            if (t.getName().startsWith(TEAM_PREFIX)) t.unregister();
        }
    }

    private static TextColor parseColor(String hex) {
        if (hex == null || hex.length() != 7) return NamedTextColor.WHITE;
        try {
            return TextColor.color(
                    Integer.parseInt(hex.substring(1, 3), 16),
                    Integer.parseInt(hex.substring(3, 5), 16),
                    Integer.parseInt(hex.substring(5, 7), 16));
        } catch (NumberFormatException e) {
            return NamedTextColor.WHITE;
        }
    }
}
