package dev.clancapes.mixin.client;

import dev.clancapes.cape.CapeManager;
import dev.clancapes.cape.CapeSkinPatcher;
import dev.clancapes.cape.PlayerCapeState;
import dev.clancapes.config.ClanCapesConfig;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.world.entity.Avatar;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.Items;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Hooks {@link AvatarRenderer#extractRenderState(Avatar, AvatarRenderState, float)}
 * at TAIL — the authoritative point, after the subclass has written back the
 * profile cape on top of whatever the parent set. The actual record splice +
 * its caching live in {@link CapeSkinPatcher}; this mixin only gates on the
 * elytra / has-cape conditions and delegates.
 */
@Mixin(AvatarRenderer.class)
public abstract class AvatarRendererMixin {

    @Inject(
            method = "extractRenderState(Lnet/minecraft/world/entity/Avatar;Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;F)V",
            at = @At("TAIL"),
            require = 0,
            expect = 0
    )
    private void clancapes$onExtractAvatar(
            Avatar avatar,
            AvatarRenderState state,
            float partialTicks,
            CallbackInfo ci
    ) {
        if (!(avatar instanceof AbstractClientPlayer player)) {
            return;
        }
        // Elytra worn: leave the cape alone — forcing the cape texture in makes
        // the wings sample the cape's elytra-UV region (undefined on a cape-only
        // PNG). Let vanilla hide the cape and draw the default elytra.
        if (isWearingElytra(player)) {
            return;
        }

        PlayerCapeState capeState = CapeManager.get().getState(player.getUUID());
        if (!capeState.hasCape() || capeState.textureId() == null) {
            // Clan cape known but texture not ready yet: optionally suppress the
            // vanilla cape so it doesn't flash before ours loads.
            if (!ClanCapesConfig.get().enableVanillaCapeFallback && capeState.hasCape()) {
                state.showCape = false;
            }
            return;
        }
        CapeSkinPatcher.applyCape(capeState, state);
    }

    private static boolean isWearingElytra(AbstractClientPlayer player) {
        return player.getItemBySlot(EquipmentSlot.CHEST).is(Items.ELYTRA);
    }
}
