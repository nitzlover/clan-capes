package dev.clancapes.mixin.client;

import dev.clancapes.ClanCapesClient;
import dev.clancapes.cape.CapeManager;
import dev.clancapes.config.ClanCapesConfig;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.core.ClientAsset;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Avatar;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Hooks {@link AvatarRenderer#extractRenderState(Avatar, AvatarRenderState, float)}
 * at TAIL. This fires AFTER the full vanilla subclass extract has run —
 * which is critical, because {@code AvatarRenderer} writes back cape data
 * from the entity's profile on top of whatever the parent class set.
 *
 * Earlier we hooked the parent {@code LivingEntityRenderer.extractRenderState},
 * which fired correctly but AvatarRenderer then clobbered our patch a few
 * lines later. Signature confirmed by the {@code MinecraftCapes} mod's
 * MC 26.1 branch (which uses the same hook).
 */
@Mixin(AvatarRenderer.class)
public abstract class AvatarRendererMixin {

    private static int debugTickCounter = 0;
    private static volatile java.lang.reflect.Constructor<?> CACHED_PLAYERSKIN_CTOR;
    private static volatile java.lang.reflect.Field CACHED_SKIN_FIELD;
    private static volatile String[] CACHED_COMP_NAMES;

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

        CapeManager manager = CapeManager.get();
        boolean shouldRender = manager.shouldRenderClanCape(player);
        boolean debug = ClanCapesConfig.get().debugLogging;
        boolean throttledLog = debug && (++debugTickCounter % 200 == 0);

        if (!shouldRender) {
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
        if (state.skin == null) {
            return;
        }

        try {
            ClientAsset.ResourceTexture capeAsset = new ClientAsset.ResourceTexture(texture);
            Object oldSkin = state.skin;
            Object newSkin = buildSkinWithCape(oldSkin, capeAsset);
            if (newSkin != null) {
                java.lang.reflect.Field skinField = CACHED_SKIN_FIELD;
                if (skinField == null) {
                    skinField = state.getClass().getField("skin");
                    CACHED_SKIN_FIELD = skinField;
                }
                skinField.set(state, newSkin);
            }
            state.showCape = true;

            if (throttledLog) {
                ClanCapesClient.LOGGER.info(
                        "AvatarRendererMixin cape applied for {}: oldCape={} newSkin={}",
                        player.getName().getString(),
                        invokeAccessor(oldSkin, "cape"),
                        newSkin);
            }
        } catch (Throwable t) {
            if (throttledLog) {
                ClanCapesClient.LOGGER.warn(
                        "AvatarRendererMixin cape force-apply failed for {}: {}",
                        player.getName().getString(), t.toString());
            }
        }
    }

    private static Object buildSkinWithCape(Object old, ClientAsset.ResourceTexture capeAsset)
            throws Throwable {
        Class<?> cls = old.getClass();
        java.lang.reflect.RecordComponent[] comps = cls.getRecordComponents();
        if (comps == null || comps.length == 0) {
            return null;
        }
        java.lang.reflect.Constructor<?> ctor = CACHED_PLAYERSKIN_CTOR;
        String[] names = CACHED_COMP_NAMES;
        if (ctor == null || names == null || names.length != comps.length) {
            Class<?>[] types = new Class<?>[comps.length];
            names = new String[comps.length];
            for (int i = 0; i < comps.length; i++) {
                types[i] = comps[i].getType();
                names[i] = comps[i].getName();
            }
            ctor = cls.getDeclaredConstructor(types);
            ctor.setAccessible(true);
            CACHED_PLAYERSKIN_CTOR = ctor;
            CACHED_COMP_NAMES = names;
        }
        Object[] args = new Object[names.length];
        for (int i = 0; i < names.length; i++) {
            if ("cape".equals(names[i])) {
                args[i] = capeAsset;
            } else {
                args[i] = cls.getMethod(names[i]).invoke(old);
            }
        }
        return ctor.newInstance(args);
    }

    private static Object invokeAccessor(Object target, String name) {
        try {
            return target.getClass().getMethod(name).invoke(target);
        } catch (Throwable t) {
            return "<err:" + t.getClass().getSimpleName() + ">";
        }
    }
}
