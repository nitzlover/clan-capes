package dev.clancapes.listener;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.clan.Clan;
import dev.clancapes.clan.ClanMember;
import dev.clancapes.clan.ClanRepository;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Entity;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.entity.Villager;
import org.bukkit.entity.ZombieVillager;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityPotionEffectEvent;
import org.bukkit.event.entity.EntityTransformEvent;
import org.bukkit.potion.PotionEffectType;

import java.util.UUID;

/**
 * Sync villager reputation perks across clan teammates.
 *
 * <p>Two trigger paths:
 *
 * <ol>
 *   <li><b>Zombie villager cure</b> — when a clan player completes the
 *       weakness + golden apple cure (via {@link EntityTransformEvent}
 *       with reason {@code CURED}), every online clan member earns
 *       {@code MAJOR_POSITIVE} gossip on the freshly-spawned villager
 *       plus every villager within a small radius. Default vanilla
 *       behaviour only gave the discount to the curer; we extend it
 *       to the whole clan for the same in-game moment.</li>
 *   <li><b>Hero of the Village</b> — when a clan member receives the
 *       {@link PotionEffectType#HERO_OF_THE_VILLAGE} effect (raid
 *       victory), we broadcast the same gossip to every clan member
 *       on nearby villagers. The vanilla effect already triggers
 *       discounts on villagers within range — we extend the
 *       "within range" criterion to "anyone in the clan".</li>
 * </ol>
 *
 * <p>Operator can disable the listener wholesale by setting
 * {@code features.villager-sync.enabled: false} in {@code config.yml}
 * (defaults to {@code true}). Failure to read the gossip API (Bukkit
 * version that doesn't expose {@code Villager#getGossips}) bails
 * silently — without this feature the server reverts to vanilla.
 */
public final class ClanVillagerListener implements Listener {
    /**
     * Radius in blocks scanned around the trigger location for
     * additional villagers to apply gossip to. Matches vanilla raid
     * "Hero of the Village" range roughly.
     */
    private static final double VILLAGER_RADIUS = 32.0;

    /**
     * Magnitude added to the gossip ledger per trigger. Vanilla cure
     * is +20 (MAJOR_POSITIVE), which roughly halves trade prices on
     * the villager's first-level offers. Keep the same magnitude so
     * the clan bonus matches vanilla expectations.
     */
    private static final int GOSSIP_MAGNITUDE = 20;

    private final ClanCapesPlugin plugin;

    public ClanVillagerListener(ClanCapesPlugin plugin) {
        this.plugin = plugin;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onTransform(EntityTransformEvent event) {
        if (event.getTransformReason() != EntityTransformEvent.TransformReason.CURED) return;
        if (!(event.getEntity() instanceof ZombieVillager zombie)) return;
        Entity transformed = event.getTransformedEntity();
        if (!(transformed instanceof Villager villager)) return;

        // Bukkit / Paper exposes the curer via getConversionPlayer() —
        // the OfflinePlayer reference is set when the weakness + golden
        // apple sequence starts, so it's available at transform time.
        OfflinePlayer curer = zombie.getConversionPlayer();
        if (curer == null) return;
        UUID curerUuid = curer.getUniqueId();

        Clan clan = resolveClan(curerUuid);
        if (clan == null) return;
        applyGossipToClan(clan, villager);
        // Sweep nearby villagers too — matches the radius behaviour
        // SharedDiscounts (the legacy plugin) had so operators
        // migrating get parity behaviour.
        applyGossipToNearby(clan, villager);
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPotionEffect(EntityPotionEffectEvent event) {
        if (event.getNewEffect() == null) return;
        if (event.getNewEffect().getType() != PotionEffectType.HERO_OF_THE_VILLAGE) return;
        if (event.getAction() != EntityPotionEffectEvent.Action.ADDED) return;
        if (!(event.getEntity() instanceof Player player)) return;

        Clan clan = resolveClan(player.getUniqueId());
        if (clan == null) return;
        // Hero of the Village radiates from the player's location;
        // sweep villagers within range and broadcast gossip to every
        // online clan member.
        applyGossipToNearby(clan, player);
    }

    private Clan resolveClan(UUID uuid) {
        ClanRepository repo = plugin.getClanRepository();
        if (repo == null) return null;
        return repo.byPlayer(uuid).orElse(null);
    }

    /**
     * Add {@code MAJOR_POSITIVE} gossip from every online clan member
     * to the given villager. Iterates clan members + filters to
     * actually-online players so we don't waste reflection calls on
     * offline UUIDs.
     */
    private void applyGossipToClan(Clan clan, Villager villager) {
        for (ClanMember m : clan.members()) {
            Player p = Bukkit.getPlayer(m.playerUuid());
            if (p == null || !p.isOnline()) continue;
            try {
                // Paper 1.21 ships a Reputation object on Villager —
                // mutate its MAJOR_POSITIVE counter, write back.
                com.destroystokyo.paper.entity.villager.Reputation rep =
                        villager.getReputation(p.getUniqueId());
                if (rep == null) {
                    rep = new com.destroystokyo.paper.entity.villager.Reputation(
                            new java.util.EnumMap<>(
                                    com.destroystokyo.paper.entity.villager.ReputationType.class));
                }
                int current = rep.getReputation(
                        com.destroystokyo.paper.entity.villager.ReputationType.MAJOR_POSITIVE);
                rep.setReputation(
                        com.destroystokyo.paper.entity.villager.ReputationType.MAJOR_POSITIVE,
                        Math.min(100, current + GOSSIP_MAGNITUDE));
                villager.setReputation(p.getUniqueId(), rep);
            } catch (NoSuchMethodError | NoClassDefFoundError unavailable) {
                // Paper API shape predates Villager#setReputation; bail
                // silently — operator just loses the perk, no log noise.
                return;
            } catch (Exception e) {
                if (plugin.getPluginConfig().isDebugLogging()) {
                    plugin.getLogger().fine("villager gossip apply failed for "
                            + p.getName() + ": " + e.getMessage());
                }
            }
        }
    }

    /** Apply gossip to every villager inside the radius of the source entity. */
    private void applyGossipToNearby(Clan clan, LivingEntity source) {
        for (Entity nearby : source.getNearbyEntities(VILLAGER_RADIUS, VILLAGER_RADIUS, VILLAGER_RADIUS)) {
            if (nearby instanceof Villager v) {
                applyGossipToClan(clan, v);
            }
        }
    }
}
