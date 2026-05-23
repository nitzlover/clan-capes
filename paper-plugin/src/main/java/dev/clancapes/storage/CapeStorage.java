package dev.clancapes.storage;

import dev.clancapes.model.ClanBannerRecord;
import dev.clancapes.model.ClanCapeRecord;

import java.util.List;
import java.util.Optional;

public interface CapeStorage {
    void init();

    void close();

    Optional<ClanCapeRecord> findByClan(String clanTag);

    List<ClanCapeRecord> findAll();

    void upsert(ClanCapeRecord record);

    void delete(String clanTag);

    void appendAudit(String clanTag, String action, String actor, String details);

    // ----- Clan banner (shield NBT) ------------------------------------------------

    Optional<ClanBannerRecord> findBannerByClan(String clanTag);

    List<ClanBannerRecord> findAllBanners();

    void upsertBanner(ClanBannerRecord record);

    void deleteBanner(String clanTag);
}
