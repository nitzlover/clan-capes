package dev.clancapes.mixin.client;

import dev.clancapes.ClanCapesClient;
import dev.clancapes.api.PlayerTrimResponse;
import dev.clancapes.config.ClanCapesConfig;
import dev.clancapes.trim.TrimManager;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.renderer.entity.layers.HumanoidArmorLayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.entity.state.HumanoidRenderState;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.core.component.DataComponents;
import net.minecraft.world.item.equipment.trim.ArmorTrim;
import net.minecraft.world.item.equipment.trim.TrimMaterial;
import net.minecraft.world.item.equipment.trim.TrimPattern;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import java.util.Optional;

/**
 * Forces the vanilla {@code ArmorTrim} data component onto each piece
 * of armour the local client renders for a player, based on the
 * {@link TrimManager} snapshot. The server doesn't have to be sending
 * the {@code minecraft:trim} component — the mod paints it in at the
 * client edge so every viewer sees the same clan-specific trim
 * regardless of inventory state.
 *
 * <p>Injection point is the {@code HumanoidArmorLayer.renderArmorPiece}
 * call chain. Resolution happens via reflection at injection time:
 *
 * <ol>
 *   <li>Mod looks up the live {@link TrimMaterial} +
 *       {@link TrimPattern} registries via the world's
 *       {@code HolderLookup.Provider} (available off the renderer's
 *       Minecraft instance).</li>
 *   <li>If both lookups resolve, builds an {@link ArmorTrim} and writes
 *       it into the per-render copy of the {@link ItemStack} using
 *       {@link DataComponents#TRIM}.</li>
 *   <li>If anything fails, the mixin no-ops — vanilla rendering
 *       continues unchanged.</li>
 * </ol>
 *
 * <p><b>Important:</b> the mixin target signature below is the most
 * stable shape between MC 1.21 and 26.1 (state-based rendering pipeline,
 * armour piece by {@link EquipmentSlot}). If the precise method name
 * shifts in a point release, adjust {@code method = …} and the
 * {@code @At} target — the inject body is signature-tolerant via
 * reflection on the render state.
 */
@Mixin(HumanoidArmorLayer.class)
public abstract class HumanoidArmorLayerMixin {

    /**
     * Apply our trim spec just before the armour piece is drawn. We hop
     * into the per-slot render call and mutate the {@code state.armor*}
     * stacks. Vanilla {@link HumanoidArmorLayer} reads the trim
     * component off the stack to look up the overlay texture; once our
     * value is in place, the standard pipeline does the rest.
     */
    @Inject(
            method = "renderArmorPiece(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/world/entity/EquipmentSlot;ILnet/minecraft/client/model/HumanoidModel;)V",
            at = @At("HEAD"),
            require = 0,
            expect = 0
    )
    private void clancapes$beforeRenderArmorPiece(
            Object poseStack,
            Object buffer,
            net.minecraft.world.entity.LivingEntity entity,
            EquipmentSlot slot,
            int packedLight,
            Object model,
            CallbackInfo ci
    ) {
        if (!(entity instanceof AbstractClientPlayer player)) return;
        if (slot == null) return;

        try {
            Optional<PlayerTrimResponse.SlotTrim> trim = TrimManager.get().getSlot(
                    player, equipmentSlotName(slot));
            if (trim.isEmpty()) return;
            applyTrimToWornItem(player, slot, trim.get());
            if (ClanCapesConfig.get().debugLogging) {
                ClanCapesClient.LOGGER.info(
                        "Applied trim {}/{} on {}'s {} slot",
                        trim.get().material(), trim.get().pattern(),
                        player.getName().getString(),
                        slot.getName());
            }
        } catch (Throwable t) {
            if (ClanCapesConfig.get().debugLogging) {
                ClanCapesClient.LOGGER.debug("Trim apply skipped: {}", t.toString());
            }
        }
    }

    private static String equipmentSlotName(EquipmentSlot slot) {
        // EquipmentSlot.HEAD/CHEST/LEGS/FEET — name() lowercased matches
        // the panel's slot keys exactly.
        return slot.name().toLowerCase(java.util.Locale.ROOT);
    }

    /**
     * Writes a synthetic {@link ArmorTrim} onto the entity's worn
     * stack for the given slot. The entity stack is server-replicated
     * so this mutation is local-only and gets overwritten on the next
     * sync — fine for a render-frame nudge.
     */
    private static void applyTrimToWornItem(AbstractClientPlayer player, EquipmentSlot slot,
                                            PlayerTrimResponse.SlotTrim spec) {
        ItemStack worn = player.getItemBySlot(slot);
        if (worn == null || worn.isEmpty()) return;

        HolderLookup.Provider provider = player.level().registryAccess();
        Optional<Holder.Reference<TrimMaterial>> material = resolve(
                provider, Registries.TRIM_MATERIAL, spec.material());
        Optional<Holder.Reference<TrimPattern>> pattern = resolve(
                provider, Registries.TRIM_PATTERN, spec.pattern());
        if (material.isEmpty() || pattern.isEmpty()) return;

        ArmorTrim trim = new ArmorTrim(material.get(), pattern.get());
        worn.set(DataComponents.TRIM, trim);
    }

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
}
