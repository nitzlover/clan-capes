package dev.clancapes.service;

import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.config.PluginConfig;
import dev.clancapes.hook.PowerClansHook;
import dev.clancapes.model.ClanCapeRecord;
import dev.clancapes.model.PlayerCapeDto;
import dev.clancapes.storage.CapeStorage;
import dev.clancapes.sync.CapeSyncChannel;
import dev.clancapes.util.CapeImageValidator;
import dev.clancapes.webhook.WebhookNotifier;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.io.File;
import java.io.IOException;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Optional;
import java.util.UUID;

public final class CapeService {
    private final ClanCapesPlugin plugin;
    private final CapeStorage storage;
    private final PluginConfig config;
    private final WebhookNotifier webhookNotifier;
    private final CapeSyncChannel syncChannel;
    private final PowerClansHook powerClansHook;

    public CapeService(
            ClanCapesPlugin plugin,
            CapeStorage storage,
            PluginConfig config,
            CapeSyncChannel syncChannel,
            PowerClansHook powerClansHook
    ) {
        this.plugin = plugin;
        this.storage = storage;
        this.config = config;
        this.syncChannel = syncChannel;
        this.powerClansHook = powerClansHook;
        this.webhookNotifier = new WebhookNotifier(plugin, config);
        new File(config.getCapesStorageDir()).mkdirs();
    }

    public PlayerCapeDto resolvePlayer(UUID uuid) {
        Optional<String> clan = powerClansHook.getClanTag(uuid);
        if (clan.isEmpty()) {
            return PlayerCapeDto.none();
        }
        return resolveClan(clan.get());
    }

    public PlayerCapeDto resolveClan(String clanTag) {
        Optional<ClanCapeRecord> record = storage.findByClan(clanTag);
        if (record.isEmpty()) {
            return PlayerCapeDto.none();
        }
        ClanCapeRecord cape = record.get();
        return new PlayerCapeDto(true, cape.capeUrl(), cape.clanTag(), cape.updatedAt());
    }

    public Optional<ClanCapeRecord> getClanCape(String clanTag) {
        return storage.findByClan(clanTag);
    }

    public void setCapeUrl(String clanTag, String url, String actor) throws IOException {
        validateUrl(url);
        String fileName = clanTag.toUpperCase() + ".png";
        String publicUrl = config.getCdnBaseUrl().replaceAll("/$", "") + "/" + fileName;

        ClanCapeRecord record = new ClanCapeRecord(
                clanTag.toUpperCase(),
                publicUrl,
                fileName,
                System.currentTimeMillis(),
                actor
        );
        storage.upsert(record);
        storage.appendAudit(clanTag, "SET_URL", actor, url);
        webhookNotifier.notifyCapeUpdated(clanTag, publicUrl);
        notifyClanMembers(clanTag);
    }

    public void setCapeFile(String clanTag, Path sourceFile, String actor) throws IOException {
        CapeImageValidator.validate(sourceFile, config.getMaxFileSizeKb());
        String fileName = clanTag.toUpperCase() + ".png";
        Path target = Path.of(config.getCapesStorageDir(), fileName);
        Files.createDirectories(target.getParent());
        Files.copy(sourceFile, target, StandardCopyOption.REPLACE_EXISTING);

        String publicUrl = config.getCdnBaseUrl().replaceAll("/$", "") + "/" + fileName;
        ClanCapeRecord record = new ClanCapeRecord(
                clanTag.toUpperCase(),
                publicUrl,
                fileName,
                System.currentTimeMillis(),
                actor
        );
        storage.upsert(record);
        storage.appendAudit(clanTag, "SET_FILE", actor, fileName);
        webhookNotifier.notifyCapeUpdated(clanTag, publicUrl);
        notifyClanMembers(clanTag);
    }

    public void removeCape(String clanTag, String actor) {
        storage.findByClan(clanTag).ifPresent(record -> {
            if (record.fileName() != null) {
                try {
                    Files.deleteIfExists(Path.of(config.getCapesStorageDir(), record.fileName()));
                } catch (IOException ignored) {
                }
            }
        });
        storage.delete(clanTag);
        storage.appendAudit(clanTag, "REMOVE", actor, null);
        webhookNotifier.notifyCapeRemoved(clanTag);
        notifyClanMembers(clanTag);
    }

    public void reloadCache() {
        plugin.getLogger().info("Cape metadata reloaded from storage");
    }

    private void notifyClanMembers(String clanTag) {
        Bukkit.getScheduler().runTask(plugin, () -> {
            for (Player online : Bukkit.getOnlinePlayers()) {
                powerClansHook.getClanTag(online).ifPresent(tag -> {
                    if (tag.equalsIgnoreCase(clanTag)) {
                        syncChannel.sendReload(online, online.getUniqueId());
                        for (Player viewer : Bukkit.getOnlinePlayers()) {
                            if (!viewer.equals(online)) {
                                syncChannel.sendReload(viewer, online.getUniqueId());
                            }
                        }
                    }
                });
            }
        });
    }

    private static void validateUrl(String url) {
        URI uri = URI.create(url);
        if (!"https".equalsIgnoreCase(uri.getScheme()) && !"http".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("URL must be http or https");
        }
    }
}
