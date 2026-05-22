package dev.clancapes.cape;

import com.mojang.blaze3d.platform.NativeImage;
import dev.clancapes.ClanCapesClient;
import dev.clancapes.ClanCapesMod;
import dev.clancapes.config.ClanCapesConfig;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.ResourceManager;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Disk + GPU texture cache. Registration happens on the render thread via {@link #registerOnRenderThread}.
 */
public final class CapeTextureCache {
    private static final String NAMESPACE = ClanCapesMod.MOD_ID;

    private final Path cacheDir;
    private final Map<String, Identifier> urlToIdentifier = new ConcurrentHashMap<>();
    private final Map<String, Long> urlToLoadedAt = new ConcurrentHashMap<>();

    public CapeTextureCache(Path cacheDir) {
        this.cacheDir = cacheDir;
        try {
            Files.createDirectories(cacheDir);
        } catch (IOException e) {
            ClanCapesClient.LOGGER.warn("Could not create cape cache directory", e);
        }
    }

    public Identifier getCachedIdentifier(String url) {
        return urlToIdentifier.get(url);
    }

    public boolean isExpired(String url) {
        Long loadedAt = urlToLoadedAt.get(url);
        if (loadedAt == null) {
            return true;
        }
        long ttlMs = ClanCapesConfig.get().cacheTtlSeconds * 1000L;
        return System.currentTimeMillis() - loadedAt > ttlMs;
    }

    public Path diskPathFor(String url) {
        return cacheDir.resolve(sha256(url) + ".png");
    }

    public NativeImage loadFromDisk(String url) throws IOException {
        Path file = diskPathFor(url);
        if (!Files.exists(file)) {
            return null;
        }
        return NativeImage.read(Files.newInputStream(file));
    }

    public void saveToDisk(String url, NativeImage image) throws IOException {
        Path file = diskPathFor(url);
        image.writeToFile(file);
    }

    /**
     * Must be called on the client/render thread.
     */
    public Identifier registerOnRenderThread(String url, NativeImage image) {
        Minecraft client = Minecraft.getInstance();
        String idPath = "capes/" + sha256(url);
        Identifier identifier = Identifier.fromNamespaceAndPath(NAMESPACE, idPath);

        DynamicTexture dynamicTexture = new DynamicTexture(() -> idPath, image);
        client.getTextureManager().register(identifier, dynamicTexture);

        Identifier previous = urlToIdentifier.put(url, identifier);
        urlToLoadedAt.put(url, System.currentTimeMillis());

        if (previous != null && !previous.equals(identifier)) {
            client.getTextureManager().release(previous);
        }
        return identifier;
    }

    public void invalidate(String url) {
        Identifier id = urlToIdentifier.remove(url);
        urlToLoadedAt.remove(url);
        if (id != null) {
            Minecraft.getInstance().execute(() ->
                    Minecraft.getInstance().getTextureManager().release(id));
        }
        try {
            Files.deleteIfExists(diskPathFor(url));
        } catch (IOException ignored) {
        }
    }

    public void clearAll() {
        urlToIdentifier.keySet().forEach(this::invalidate);
    }

    private static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes());
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            return Integer.toHexString(input.hashCode());
        }
    }
}
