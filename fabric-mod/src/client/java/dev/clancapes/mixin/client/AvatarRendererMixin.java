package dev.clancapes.mixin.client;

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
 * Injects clan cape texture into {@link AvatarRenderState} after vanilla extracts cape data (MC 26.1).
 */
@Mixin(AvatarRenderer.class)
public abstract class AvatarRendererMixin {

    @Inject(
            method = "extractCapeState(Lnet/minecraft/client/entity/ClientAvatarEntity;Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;F)V",
            at = @At("TAIL")
    )
    private void clancapes$applyClanCape(
            ClientAvatarEntity entity,
            AvatarRenderState state,
            float partialTicks,
            CallbackInfo ci
    ) {
        if (!(entity instanceof AbstractClientPlayer player)) {
            return;
        }

        CapeManager manager = CapeManager.get();
        if (!manager.shouldRenderClanCape(player)) {
            if (!ClanCapesConfig.get().enableVanillaCapeFallback && manager.getState(player.getUUID()).hasCape()) {
                state.showCape = false;
            }
            return;
        }

        Identifier texture = manager.getCapeTexture(player);
        if (texture == null) {
            return;
        }

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
    }
}
