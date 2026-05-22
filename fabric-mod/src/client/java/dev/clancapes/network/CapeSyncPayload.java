package dev.clancapes.network;

import dev.clancapes.ClanCapesMod;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.Identifier;

/**
 * Raw plugin-message payload for channel {@code clancapes:sync} (server → client).
 */
public record CapeSyncPayload(byte[] data) implements CustomPacketPayload {
    public static final CustomPacketPayload.Type<CapeSyncPayload> TYPE =
            new CustomPacketPayload.Type<>(Identifier.fromNamespaceAndPath(ClanCapesMod.MOD_ID, "sync"));

    public static final StreamCodec<RegistryFriendlyByteBuf, CapeSyncPayload> STREAM_CODEC = StreamCodec.of(
            (buf, payload) -> buf.writeBytes(payload.data),
            buf -> new CapeSyncPayload(buf.readByteArray(buf.readableBytes()))
    );

    @Override
    public Type<CapeSyncPayload> type() {
        return TYPE;
    }
}
