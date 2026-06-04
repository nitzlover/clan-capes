package dev.clancapes.cape;

import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.core.ClientAsset;
import net.minecraft.resources.Identifier;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;

/**
 * Splices the clan cape texture into an {@link AvatarRenderState}'s
 * {@code PlayerSkin} record, with every bit of reflection cached and the
 * record reconstruction skipped whenever it isn't needed.
 *
 * <h2>Why the cache matters</h2>
 * The render mixins run at TAIL of {@code extractRenderState} every frame for
 * every visible player. {@code AvatarRenderer} re-assigns {@code state.skin}
 * from the player's cached profile skin each frame — but that profile skin is
 * a <em>stable object</em> (Mojang caches it until the skin reloads), so we can
 * key our patched copy on the base-skin identity: rebuild once, then just
 * re-point the field at the cached patched skin on subsequent frames. That
 * turns a per-frame record reconstruction (5 reflective accessor invokes +
 * {@code Constructor.newInstance}) into a couple of identity comparisons.
 *
 * <h2>Threading</h2>
 * Only ever called from the render-thread mixins, so the static reflection
 * cache and the per-state patched-skin cache need no synchronisation.
 */
public final class CapeSkinPatcher {
    private CapeSkinPatcher() {
    }

    // Resolved once for the PlayerSkin record class (stable for the run).
    private static Class<?> skinClass;
    private static Constructor<?> ctor;
    private static String[] componentNames;
    private static Method[] accessors; // per component; null entry == the "cape" slot
    private static Field skinField;    // AvatarRenderState.skin

    /**
     * Force {@code state.textureId()} onto {@code avatarState}'s cape and flip
     * {@code showCape} on. No-op (other than enabling the cape) when the state
     * already carries our patched skin for this texture. Failures are swallowed
     * so a render frame never crashes — the player just shows their vanilla
     * skin until the next attempt.
     */
    public static void applyCape(PlayerCapeState state, AvatarRenderState avatarState) {
        Identifier texture = state.textureId();
        if (texture == null) {
            return;
        }
        Object current = avatarState.skin;
        if (current == null) {
            return;
        }

        // Already our patched skin (no clobber since we set it) → just keep it.
        if (current == state.patchedSkin() && texture == state.patchedTexture()) {
            avatarState.showCape = true;
            return;
        }

        try {
            // Same base skin object as last rebuild (the common case — Mojang
            // hands back the same cached profile skin each frame) → reuse the
            // patched copy, no reconstruction.
            if (current == state.baseSkin() && texture == state.patchedTexture()
                    && state.patchedSkin() != null) {
                field().set(avatarState, state.patchedSkin());
                avatarState.showCape = true;
                return;
            }

            ensureReflection(current.getClass());
            Object cape = new ClientAsset.ResourceTexture(texture);
            Object patched = rebuild(current, cape);
            if (patched != null) {
                field().set(avatarState, patched);
                state.setPatchedSkin(current, patched, texture);
            }
            avatarState.showCape = true;
        } catch (Throwable ignored) {
            // Leave the vanilla skin in place for this frame.
        }
    }

    private static Field field() throws ReflectiveOperationException {
        Field f = skinField;
        if (f == null) {
            f = AvatarRenderState.class.getField("skin");
            skinField = f;
        }
        return f;
    }

    private static void ensureReflection(Class<?> cls) throws ReflectiveOperationException {
        if (skinClass == cls && ctor != null) {
            return;
        }
        java.lang.reflect.RecordComponent[] comps = cls.getRecordComponents();
        Class<?>[] types = new Class<?>[comps.length];
        String[] names = new String[comps.length];
        Method[] acc = new Method[comps.length];
        for (int i = 0; i < comps.length; i++) {
            types[i] = comps[i].getType();
            names[i] = comps[i].getName();
            acc[i] = "cape".equals(names[i]) ? null : cls.getMethod(names[i]);
        }
        Constructor<?> c = cls.getDeclaredConstructor(types);
        c.setAccessible(true);
        skinClass = cls;
        ctor = c;
        componentNames = names;
        accessors = acc;
    }

    private static Object rebuild(Object old, Object cape) throws ReflectiveOperationException {
        Object[] args = new Object[componentNames.length];
        for (int i = 0; i < args.length; i++) {
            args[i] = accessors[i] == null ? cape : accessors[i].invoke(old);
        }
        return ctor.newInstance(args);
    }
}
