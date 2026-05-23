package dev.clancapes.service;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.hook.PowerClansHook;
import dev.clancapes.model.BannerPatternSpec;
import dev.clancapes.model.ClanBannerRecord;
import dev.clancapes.storage.CapeStorage;
import dev.clancapes.util.BannerPatternCodes;
import org.bukkit.DyeColor;
import org.bukkit.Material;
import org.bukkit.block.Banner;
import org.bukkit.block.banner.Pattern;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.PlayerInventory;
import org.bukkit.inventory.meta.BlockStateMeta;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Per-clan shield banner: stores the spec, applies it onto a held SHIELD
 * item when the bearer is in a clan with a banner registered.
 *
 * The service is intentionally tiny — it just talks to {@link CapeStorage}
 * for persistence and uses {@link BannerPatternCodes} to translate the
 * short codes the panel sends into modern {@link Pattern} instances.
 */
public final class BannerService {
    private final ClanCapesPlugin plugin;
    private final CapeStorage storage;
    private final PowerClansHook powerClansHook;

    public BannerService(ClanCapesPlugin plugin, CapeStorage storage, PowerClansHook powerClansHook) {
        this.plugin = plugin;
        this.storage = storage;
        this.powerClansHook = powerClansHook;
    }

    public Optional<ClanBannerRecord> getBanner(String clanTag) {
        return storage.findBannerByClan(clanTag);
    }

    public List<ClanBannerRecord> getAll() {
        return storage.findAllBanners();
    }

    public ClanBannerRecord setBanner(String clanTag, int baseColor, List<BannerPatternSpec> patterns, String actor) {
        if (baseColor < 0 || baseColor > 15) {
            throw new IllegalArgumentException("baseColor must be 0..15");
        }
        ClanBannerRecord record = new ClanBannerRecord(
                clanTag.toUpperCase(),
                baseColor,
                patterns != null ? List.copyOf(patterns) : List.of(),
                System.currentTimeMillis(),
                actor
        );
        storage.upsertBanner(record);
        storage.appendAudit(clanTag, "BANNER_SET", actor,
                "base=" + baseColor + " patterns=" + record.patterns().size());
        plugin.getLogger().info("Banner SET clan=" + clanTag.toUpperCase()
                + " by=" + actor + " patterns=" + record.patterns().size());
        return record;
    }

    public void removeBanner(String clanTag, String actor) {
        storage.deleteBanner(clanTag);
        storage.appendAudit(clanTag, "BANNER_REMOVE", actor, null);
        plugin.getLogger().info("Banner REMOVE clan=" + clanTag.toUpperCase() + " by=" + actor);
    }

    /**
     * Apply the player's clan banner to their currently held SHIELD items
     * (both main hand and off-hand). No-op if the player isn't in a clan or
     * the clan has no banner spec.
     *
     * Safe to call from any event handler — we read player state synchronously
     * and only mutate the held ItemStack via the Bukkit ItemMeta API, which
     * preserves enchantments, custom names and durability.
     */
    public void applyToHeldShields(Player player) {
        Optional<String> clan = powerClansHook.getClanTag(player);
        if (clan.isEmpty()) {
            return;
        }
        Optional<ClanBannerRecord> spec = getBanner(clan.get());
        if (spec.isEmpty()) {
            return;
        }
        PlayerInventory inv = player.getInventory();
        ItemStack main = inv.getItemInMainHand();
        ItemStack off = inv.getItemInOffHand();
        if (applyToShield(main, spec.get())) {
            inv.setItemInMainHand(main);
        }
        if (applyToShield(off, spec.get())) {
            inv.setItemInOffHand(off);
        }
    }

    /**
     * Mutate a single shield ItemStack in-place. Returns true when the item
     * was a shield and had its banner data updated, so the caller knows to
     * write it back into the inventory slot.
     */
    public boolean applyToShield(ItemStack item, ClanBannerRecord spec) {
        if (item == null || item.getType() != Material.SHIELD) {
            return false;
        }
        if (!(item.getItemMeta() instanceof BlockStateMeta meta)) {
            return false;
        }
        if (!(meta.getBlockState() instanceof Banner banner)) {
            return false;
        }

        DyeColor[] colours = DyeColor.values();
        int baseIdx = spec.baseColor();
        if (baseIdx < 0 || baseIdx >= colours.length) {
            baseIdx = 0;
        }
        banner.setBaseColor(colours[baseIdx]);

        List<Pattern> resolved = new ArrayList<>(spec.patterns().size());
        for (BannerPatternSpec p : spec.patterns()) {
            BannerPatternCodes.resolvePattern(p.color(), p.pattern()).ifPresent(resolved::add);
        }
        banner.setPatterns(resolved);
        banner.update();
        meta.setBlockState(banner);
        item.setItemMeta(meta);
        return true;
    }
}
