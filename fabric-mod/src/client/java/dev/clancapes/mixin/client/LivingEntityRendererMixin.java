package dev.clancapes.mixin.client;

import dev.clancapes.cape.CapeManager;
import dev.clancapes.cape.CapeSkinPatcher;
import dev.clancapes.cape.PlayerCapeState;
import dev.clancapes.config.ClanCapesConfig;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.Items;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Backstop hook on the base {@code LivingEntityRenderer.extractRenderState}, in
 * case a renderer ever populates the player skin without routing through
 * {@link net.minecraft.client.renderer.entity.player.AvatarRenderer}. Guarded
 * to players with an {@link AvatarRenderState}; mobs return immediately. Shares
 * {@link CapeSkinPatcher}, whose base-skin cache makes the (usually redundant)
 * second pass per frame collapse to a couple of identity comparisons.
 */
@Mixin(LivingEntityRenderer.class)
public abstract class LivingEntityRendererMixin {

    @Inject(
            method = "extractRenderState(Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/client/renderer/entity/state/LivingEntityRenderState;F)V",
            at = @At("TAIL"),
            require = 0,
            expect = 0
    )
    private void clancapes$onExtractLiving(
            LivingEntity entity,
            LivingEntityRenderState state,
            float partialTicks,
            CallbackInfo ci
    ) {
        if (!(entity instanceof AbstractClientPlayer player)) {
            return;
        }
        if (!(state instanceof AvatarRenderState avatarState)) {
            return;
        }
        if (isWearingElytra(player)) {
            return;
        }

        PlayerCapeState capeState = CapeManager.get().getState(player.getUUID());
        if (!capeState.hasCape() || capeState.textureId() == null) {
            if (!ClanCapesConfig.get().enableVanillaCapeFallback && capeState.hasCape()) {
                avatarState.showCape = false;
            }
            return;
        }
        CapeSkinPatcher.applyCape(capeState, avatarState);
    }

    private static boolean isWearingElytra(AbstractClientPlayer player) {
        return player.getItemBySlot(EquipmentSlot.CHEST).is(Items.ELYTRA);
    }
}
