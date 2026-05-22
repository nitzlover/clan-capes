package dev.clancapes.mixin.client;

import dev.clancapes.cape.CapeManager;
import net.minecraft.client.player.AbstractClientPlayer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.util.UUID;

/**
 * Eagerly schedules API lookup when a player entity is constructed on the client.
 */
@Mixin(AbstractClientPlayer.class)
public abstract class AbstractClientPlayerMixin {

    @Inject(method = "<init>", at = @At("TAIL"))
    private void clancapes$onInit(CallbackInfo ci) {
        AbstractClientPlayer self = (AbstractClientPlayer) (Object) this;
        UUID uuid = self.getUUID();
        CapeManager.get().refreshPlayer(uuid, false);
    }
}
