package dev.clancapes.mixin.client;

import dev.clancapes.ClanCapesClient;
import dev.clancapes.cape.CapeManager;
import dev.clancapes.config.ClanCapesConfig;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.LivingEntityRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.core.ClientAsset;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.LivingEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Universal hook into the base {@code LivingEntityRenderer.extractRenderState}.
 * On MC 26.1 the {@code PlayerSkin.Patch}/{@code .with()} round-trip doesn't
 * reliably populate {@code state.skin.cape} for the renderer (possibly because
 * a downstream mod such as skinlayers3d / Iris rewrites {@code state.skin}
 * after our handler), so this mixin force-constructs a new {@code PlayerSkin}
 * record via reflection and writes it directly into the state field every
 * frame. That's a bigger hammer than {@code Patch}, but it survives any
 * downstream mutator that doesn't itself clobber the field afterwards.
 */
@Mixin(LivingEntityRenderer.class)
public abstract class LivingEntityRendererMixin {

    private static int debugTickCounter = 0;
    private static volatile java.lang.reflect.Constructor<?> CACHED_PLAYERSKIN_CTOR;
    private static volatile java.lang.reflect.Field CACHED_SKIN_FIELD;
    private static volatile String[] CACHED_COMP_NAMES;

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

        CapeManager manager = CapeManager.get();
        boolean shouldRender = manager.shouldRenderClanCape(player);
        boolean debug = ClanCapesConfig.get().debugLogging;
        boolean throttledLog = debug && (++debugTickCounter % 200 == 0);

        if (!shouldRender) {
            if (!ClanCapesConfig.get().enableVanillaCapeFallback
                    && manager.getState(player.getUUID()).hasCape()) {
                avatarState.showCape = false;
            }
            return;
        }

        Identifier texture = manager.getCapeTexture(player);
        if (texture == null) {
            return;
        }
        if (avatarState.skin == null) {
            return;
        }

        try {
            ClientAsset.ResourceTexture capeAsset = new ClientAsset.ResourceTexture(texture);
            Object oldSkin = avatarState.skin;
            Object newSkin = buildSkinWithCape(oldSkin, capeAsset);
            if (newSkin != null) {
                java.lang.reflect.Field skinField = CACHED_SKIN_FIELD;
                if (skinField == null) {
                    skinField = avatarState.getClass().getField("skin");
                    CACHED_SKIN_FIELD = skinField;
                }
                skinField.set(avatarState, newSkin);
            }
            avatarState.showCape = true;

            if (throttledLog) {
                ClanCapesClient.LOGGER.info(
                        "Cape force-applied for {}: oldCape={} newSkin={}",
                        player.getName().getString(),
                        invokeAccessor(oldSkin, "cape"),
                        newSkin);
            }
        } catch (Throwable t) {
            if (throttledLog) {
                ClanCapesClient.LOGGER.warn(
                        "Cape force-apply failed for {}: {}",
                        player.getName().getString(), t.toString());
            }
        }
    }

    /**
     * Build a new PlayerSkin record copying every component from {@code old}
     * except {@code cape}, which is replaced with {@code capeAsset}. Caches
     * the resolved constructor and component-name array on the first call so
     * subsequent frames are cheap.
     */
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
