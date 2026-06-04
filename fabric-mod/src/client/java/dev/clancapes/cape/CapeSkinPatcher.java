package dev.clancapes.cape;

import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.core.ClientAsset;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.player.PlayerSkin;

/**
 * Splices the clan cape texture into an {@link AvatarRenderState}'s
 * {@link PlayerSkin} record.
 *
 * <h2>No reflection</h2>
 * {@code PlayerSkin} is a public record with a public canonical constructor and
 * public accessors, and {@code AvatarRenderState.skin} is a public field — so
 * the splice is a plain, compile-checked {@code new PlayerSkin(...)} and a
 * direct field assignment. (Earlier builds rebuilt the record reflectively to
 * be resilient to unknown record shapes; pinned to MC 26.1.x that was pure
 * overhead. If a future MC changes {@code PlayerSkin}'s components this fails
 * to compile, which is exactly the signal we want.)
 *
 * <h2>Allocation cache</h2>
 * The render mixins call this at TAIL of {@code extractRenderState} every frame
 * for every visible player, and {@code AvatarRenderer} re-assigns {@code skin}
 * from the player's <em>cached</em> profile skin each frame (a stable object).
 * Keying the patched copy on that base-skin identity makes the steady state
 * allocation-free: rebuild once, then just re-point the field. Only touched on
 * the render thread, so no synchronisation.
 */
public final class CapeSkinPatcher {
    private CapeSkinPatcher() {
    }

    public static void applyCape(PlayerCapeState state, AvatarRenderState avatarState) {
        Identifier texture = state.textureId();
        if (texture == null) {
            return;
        }
        PlayerSkin current = avatarState.skin;
        if (current == null) {
            return;
        }

        // Field already holds our patched skin (nothing clobbered it) → keep it.
        if (current == state.patchedSkin() && texture == state.patchedTexture()) {
            avatarState.showCape = true;
            return;
        }

        // Same base object as the last rebuild (Mojang re-hands the same cached
        // profile skin each frame) and same cape texture → reuse the patched
        // copy, zero allocation.
        if (current == state.baseSkin() && texture == state.patchedTexture()
                && state.patchedSkin() instanceof PlayerSkin cached) {
            avatarState.skin = cached;
            avatarState.showCape = true;
            return;
        }

        PlayerSkin patched = new PlayerSkin(
                current.body(),
                new ClientAsset.ResourceTexture(texture),
                current.elytra(),
                current.model(),
                current.secure());
        avatarState.skin = patched;
        state.setPatchedSkin(current, patched, texture);
        avatarState.showCape = true;
    }
}
