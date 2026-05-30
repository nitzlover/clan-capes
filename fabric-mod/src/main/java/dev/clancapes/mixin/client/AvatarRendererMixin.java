package dev.clancapes.mixin.client;

import dev.clancapes.ClanCapesClient;
import dev.clancapes.api.PlayerTrimResponse;
import dev.clancapes.cape.CapeManager;
import dev.clancapes.config.ClanCapesConfig;
import dev.clancapes.trim.TrimManager;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.core.ClientAsset;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.Avatar;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.equipment.trim.ArmorTrim;
import net.minecraft.world.item.equipment.trim.TrimMaterial;
import net.minecraft.world.item.equipment.trim.TrimPattern;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.util.Optional;

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

    /**
     * Second injection at the same TAIL hook: mutate the four armour
     * slots' ItemStacks in the render state to attach a synthetic
     * {@link ArmorTrim} data component. State-based rendering means
     * {@code HumanoidArmorLayer.submit(...)} reads the trim straight
     * off these stacks each frame, so once the component is in place
     * the vanilla overlay pipeline draws it without any further
     * mixin into the layer itself.
     *
     * <p>Replaces the old (and silently broken since the 26.1 state-
     * based render refactor) {@code HumanoidArmorLayerMixin} hook on
     * {@code renderArmorPiece(... LivingEntity ... HumanoidModel)V} —
     * that signature was deleted by Mojang, our @Inject had
     * require=0/expect=0 so it failed silently, and clan trims
     * stopped showing on every viewer.
     */
    @Inject(
            method = "extractRenderState(Lnet/minecraft/world/entity/Avatar;Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;F)V",
            at = @At("TAIL"),
            require = 0,
            expect = 0
    )
    private void clancapes$applyClanTrims(
            Avatar avatar,
            AvatarRenderState state,
            float partialTicks,
            CallbackInfo ci
    ) {
        if (!(avatar instanceof AbstractClientPlayer player)) return;
        try {
            HolderLookup.Provider provider = player.level().registryAccess();
            state.headEquipment = withTrim(state.headEquipment, "head", player, provider);
            state.chestEquipment = withTrim(state.chestEquipment, "chest", player, provider);
            state.legsEquipment = withTrim(state.legsEquipment, "legs", player, provider);
            state.feetEquipment = withTrim(state.feetEquipment, "feet", player, provider);
        } catch (Throwable t) {
            if (ClanCapesConfig.get().debugLogging) {
                ClanCapesClient.LOGGER.debug("Trim state mutation failed: {}", t.toString());
            }
        }
    }

    /**
     * Copy the worn stack and stamp the clan trim component on the
     * copy. The state's reference is then swapped to the copy so the
     * mutation can't leak back to the live entity inventory the
     * client mirrors from the server.
     */
    private static ItemStack withTrim(ItemStack original, String slot,
                                      AbstractClientPlayer player,
                                      HolderLookup.Provider provider) {
        if (original == null || original.isEmpty()) return original;
        Optional<PlayerTrimResponse.SlotTrim> spec = TrimManager.get().getSlot(player, slot);
        if (spec.isEmpty()) return original;
        Optional<Holder.Reference<TrimMaterial>> material = resolve(
                provider, Registries.TRIM_MATERIAL, spec.get().material());
        Optional<Holder.Reference<TrimPattern>> pattern = resolve(
                provider, Registries.TRIM_PATTERN, spec.get().pattern());
        if (material.isEmpty() || pattern.isEmpty()) return original;
        ItemStack copy = original.copy();
        copy.set(DataComponents.TRIM, new ArmorTrim(material.get(), pattern.get()));
        if (ClanCapesConfig.get().debugLogging && (debugTickCounter % 200 == 0)) {
            ClanCapesClient.LOGGER.info(
                    "Applied trim {}/{} on {}'s {} slot",
                    spec.get().material(), spec.get().pattern(),
                    player.getName().getString(), slot);
        }
        return copy;
    }

    /**
     * Resolve a panel-supplied string id (e.g. {@code "diamond"} or
     * {@code "minecraft:sentry"}) to a registry holder. {@code minecraft:}
     * is inferred when no namespace is given. Unknown ids return empty
     * — caller treats that as "no trim for this slot".
     */
    private static <T> Optional<Holder.Reference<T>> resolve(
            HolderLookup.Provider provider,
            ResourceKey<Registry<T>> registry,
            String id
    ) {
        if (id == null || id.isBlank()) return Optional.empty();
        try {
            Identifier rid = id.contains(":") ? Identifier.parse(id)
                    : Identifier.parse("minecraft:" + id);
            return provider.lookupOrThrow(registry).get(ResourceKey.create(registry, rid));
        } catch (Throwable t) {
            return Optional.empty();
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
