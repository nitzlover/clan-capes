package dev.clancapes.mixin.client;

import dev.clancapes.ClanCapesClient;
import dev.clancapes.cape.CapeManager;
import dev.clancapes.config.ClanCapesConfig;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.core.ClientAsset;
import net.minecraft.resources.Identifier;
import net.minecraft.client.entity.ClientAvatarEntity;
import net.minecraft.world.entity.player.PlayerSkin;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.util.Optional;

/**
 * Injects clan cape texture into {@link AvatarRenderState} after vanilla extracts
 * cape data on MC 26.1. The cape-specific {@code extractCapeState} method was
 * renamed/refactored between 26.1 prereleases — to remain resilient across map
 * drift, this mixin targets the general {@code extractRenderState} method and
 * overrides the cape after vanilla wrote it.
 *
 * <p>Both injectors use {@code require = 0} so a target signature change in a
 * future MC update degrades gracefully (mod loads, no clan capes) instead of
 * crashing the client at boot.</p>
 */
@Mixin(AvatarRenderer.class)
public abstract class AvatarRendererMixin {

    /**
     * Primary target: 26.1 release signature.
     */
    @Inject(
            method = "extractCapeState(Lnet/minecraft/client/entity/ClientAvatarEntity;Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;F)V",
            at = @At("TAIL"),
            require = 0,
            expect = 0
    )
    private void clancapes$applyClanCapeViaExtractCape(
            ClientAvatarEntity entity,
            AvatarRenderState state,
            float partialTicks,
            CallbackInfo ci
    ) {
        applyCape(entity, state);
    }

    /**
     * Fallback target: the parent extract method on {@code LivingEntityRenderer}
     * is called once per render and is far less likely to be renamed. We hook
     * here as a safety net for when the {@code extractCapeState} target above
     * doesn't match the current mappings.
     *
     * <p>Two overload candidates are listed; mixin will pick whichever exists
     * (both use {@code require = 0}).</p>
     */
    @Inject(
            method = "extractRenderState(Lnet/minecraft/client/entity/ClientAvatarEntity;Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;F)V",
            at = @At("TAIL"),
            require = 0,
            expect = 0
    )
    private void clancapes$applyClanCapeViaExtractState(
            ClientAvatarEntity entity,
            AvatarRenderState state,
            float partialTicks,
            CallbackInfo ci
    ) {
        applyCape(entity, state);
    }

    private static void applyCape(ClientAvatarEntity entity, AvatarRenderState state) {
        if (!(entity instanceof AbstractClientPlayer player)) {
            return;
        }

        CapeManager manager = CapeManager.get();
        if (!manager.shouldRenderClanCape(player)) {
            if (!ClanCapesConfig.get().enableVanillaCapeFallback
                    && manager.getState(player.getUUID()).hasCape()) {
                state.showCape = false;
            }
            return;
        }

        Identifier texture = manager.getCapeTexture(player);
        if (texture == null) {
            return;
        }

        try {
            ClientAsset.ResourceTexture capeAsset = new ClientAsset.ResourceTexture(texture);
            PlayerSkin.Patch patch = PlayerSkin.Patch.create(
                    Optional.empty(),
                    Optional.of(capeAsset),
                    Optional.empty(),
                    Optional.empty()
            );

            if (state.skin != null) {
                state.skin = state.skin.with(patch);
            }
            state.showCape = true;
        } catch (Throwable t) {
            // Defensive: API shapes (PlayerSkin.Patch, ClientAsset) may shift between
            // MC builds. Log once, never crash the render thread.
            ClanCapesClient.LOGGER.warn("Cape patch failed for {}: {}", player.getName().getString(), t.toString());
        }
    }
}
