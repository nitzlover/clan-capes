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
     *
     * Vanilla {@code ClientAsset.ResourceTexture} derives the GL texture path
     * from the supplied id by transforming {@code <ns>:<p>} into
     * {@code <ns>:textures/<p>.png} via {@code texturePath()}. The cape
     * renderer binds the texture using {@code texturePath()}, so we MUST
     * register the dynamic texture under that derived identifier — not the
     * bare id — or the bind silently falls through to the missing-texture
     * stub. (Previously we registered under {@code clancapes:capes/<hash>}
     * while the render path looked up {@code clancapes:textures/capes/<hash>.png},
     * and capes never showed up despite the patch chain succeeding.)
     */
    public Identifier registerOnRenderThread(String url, NativeImage image) {
        Minecraft client = Minecraft.getInstance();
        String idPath = "capes/" + sha256(url);
        // The id we store and hand back to PlayerSkin.cape — same shape as a
        // vanilla skin identifier (no "textures/" prefix, no ".png" suffix).
        Identifier identifier = Identifier.fromNamespaceAndPath(NAMESPACE, idPath);
        // The identifier the cape layer actually looks up at bind time.
        Identifier renderPath = Identifier.fromNamespaceAndPath(NAMESPACE, "textures/" + idPath + ".png");

        DynamicTexture dynamicTexture = new DynamicTexture(() -> idPath, image);
        // Belt-and-suspenders: register the same dynamic texture under BOTH
        // the bare id and the texturePath()-transformed id, because different
        // render paths in different MC versions use one or the other for the
        // GL bind. This is cheap (single GL texture handle is shared) and
        // means we no longer have to second-guess the engine internals.
        client.getTextureManager().register(renderPath, dynamicTexture);
        try {
            client.getTextureManager().register(identifier, dynamicTexture);
        } catch (Throwable ignored) {
            // Some MC builds reject double-registering the same DynamicTexture
            // under two ids — fall back to renderPath-only registration which
            // covers the vanilla cape layer path.
        }
        ClanCapesClient.LOGGER.info(
                "Cape texture registered for {} as id={} renderPath={}", url, identifier, renderPath);

        Identifier previous = urlToIdentifier.put(url, identifier);
        urlToLoadedAt.put(url, System.currentTimeMillis());

        if (previous != null && !previous.equals(identifier)) {
            // Old registrations also lived under the textures/.../.png path,
            // so release with the same transform.
            Identifier previousRender = Identifier.fromNamespaceAndPath(
                    previous.getNamespace(),
                    "textures/" + previous.getPath() + ".png");
            client.getTextureManager().release(previousRender);
        }
        return identifier;
    }

    public void invalidate(String url) {
        Identifier id = urlToIdentifier.remove(url);
        urlToLoadedAt.remove(url);
        if (id != null) {
            // We registered under the texturePath transform; release under
            // the same transform.
            Identifier renderPath = Identifier.fromNamespaceAndPath(
                    id.getNamespace(),
                    "textures/" + id.getPath() + ".png");
            Minecraft.getInstance().execute(() ->
                    Minecraft.getInstance().getTextureManager().release(renderPath));
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
            byte[] hash = digest.digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            return Integer.toHexString(input.hashCode());
        }
    }
}
