package dev.clancapes.config;

import net.minecraft.client.multiplayer.ServerData;

/**
 * Derives the Clan Capes REST API base URL from the multiplayer address the player used to connect.
 */
public final class ServerAddressResolver {
    private ServerAddressResolver() {
    }

    public static String resolveApiBaseUrl(ServerData server, int apiPort) {
        if (server == null || server.ip == null || server.ip.isBlank()) {
            return null;
        }
        if (server.isLan() || server.isRealm()) {
            return null;
        }

        String host = parseHost(server.ip);
        if (host == null || host.isBlank()) {
            return null;
        }

        if ("localhost".equalsIgnoreCase(host)) {
            host = "127.0.0.1";
        }

        return "http://" + host + ":" + apiPort;
    }

    /**
     * Strips a trailing game port from addresses like {@code play.example.com:25565} or {@code [2001:db8::1]:25565}.
     */
    static String parseHost(String address) {
        String trimmed = address.trim();
        if (trimmed.isEmpty()) {
            return null;
        }

        if (trimmed.startsWith("[")) {
            int end = trimmed.indexOf(']');
            if (end > 1) {
                return trimmed.substring(1, end);
            }
            return trimmed;
        }

        int colon = trimmed.lastIndexOf(':');
        if (colon > 0) {
            String tail = trimmed.substring(colon + 1);
            if (tail.matches("\\d{1,5}")) {
                return trimmed.substring(0, colon);
            }
        }

        return trimmed;
    }
}
