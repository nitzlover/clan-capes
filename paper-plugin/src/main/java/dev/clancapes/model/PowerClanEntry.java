package dev.clancapes.model;

/**
 * Clan row from PowerClans ({@code data.yml} or API).
 *
 * @param id   internal clan key (e.g. {@code otmorozki})
 * @param tag  short tag used for capes / chat (e.g. {@code KING})
 * @param leader leader UUID string
 * @param level clan level
 */
public record PowerClanEntry(String id, String tag, String leader, int level) {
}
