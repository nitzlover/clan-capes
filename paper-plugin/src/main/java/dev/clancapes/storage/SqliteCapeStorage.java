package dev.clancapes.storage;

import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.model.BannerPatternSpec;
import dev.clancapes.model.ClanBannerRecord;
import dev.clancapes.model.ClanCapeRecord;

import java.io.File;
import java.lang.reflect.Type;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public final class SqliteCapeStorage implements CapeStorage {
    private static final Gson GSON = new Gson();
    private static final Type PATTERNS_TYPE =
            new TypeToken<List<BannerPatternSpec>>() {}.getType();

    private final ClanCapesPlugin plugin;
    private final String databasePath;
    private HikariDataSource dataSource;

    public SqliteCapeStorage(ClanCapesPlugin plugin, String databasePath) {
        this.plugin = plugin;
        this.databasePath = databasePath;
    }

    @Override
    public void init() {
        File file = new File(databasePath);
        file.getParentFile().mkdirs();

        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:sqlite:" + file.getAbsolutePath());
        config.setMaximumPoolSize(4);
        config.setPoolName("ClanCapes-SQLite");
        dataSource = new HikariDataSource(config);

        try (Connection conn = dataSource.getConnection();
             java.sql.Statement stmt = conn.createStatement()) {
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS clan_capes (
                    clan_tag TEXT PRIMARY KEY,
                    cape_url TEXT NOT NULL,
                    file_name TEXT,
                    updated_at INTEGER NOT NULL,
                    updated_by TEXT
                );
                """);
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    clan_tag TEXT NOT NULL,
                    action TEXT NOT NULL,
                    actor TEXT,
                    details TEXT,
                    created_at INTEGER NOT NULL
                );
                """);
            stmt.execute("CREATE INDEX IF NOT EXISTS idx_audit_clan ON audit_logs(clan_tag)");
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS clan_banners (
                    clan_tag TEXT PRIMARY KEY,
                    base_color INTEGER NOT NULL,
                    patterns_json TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    updated_by TEXT
                );
                """);
        } catch (Exception e) {
            plugin.getLogger().severe("Failed to initialize SQLite: " + e.getMessage());
        }
    }

    @Override
    public void close() {
        if (dataSource != null) {
            dataSource.close();
        }
    }

    // ----- Capes --------------------------------------------------------------

    @Override
    public Optional<ClanCapeRecord> findByClan(String clanTag) {
        String sql = "SELECT clan_tag, cape_url, file_name, updated_at, updated_by FROM clan_capes WHERE clan_tag = ?";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, clanTag.toUpperCase());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapCape(rs));
                }
            }
        } catch (Exception e) {
            plugin.getLogger().warning("findByClan failed: " + e.getMessage());
        }
        return Optional.empty();
    }

    @Override
    public List<ClanCapeRecord> findAll() {
        List<ClanCapeRecord> list = new ArrayList<>();
        String sql = "SELECT clan_tag, cape_url, file_name, updated_at, updated_by FROM clan_capes ORDER BY clan_tag";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                list.add(mapCape(rs));
            }
        } catch (Exception e) {
            plugin.getLogger().warning("findAll failed: " + e.getMessage());
        }
        return list;
    }

    @Override
    public void upsert(ClanCapeRecord record) {
        String sql = """
            INSERT INTO clan_capes (clan_tag, cape_url, file_name, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(clan_tag) DO UPDATE SET
                cape_url = excluded.cape_url,
                file_name = excluded.file_name,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by
            """;
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, record.clanTag().toUpperCase());
            ps.setString(2, record.capeUrl());
            ps.setString(3, record.fileName());
            ps.setLong(4, record.updatedAt());
            ps.setString(5, record.updatedBy());
            ps.executeUpdate();
        } catch (Exception e) {
            plugin.getLogger().warning("upsert failed: " + e.getMessage());
        }
    }

    @Override
    public void delete(String clanTag) {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("DELETE FROM clan_capes WHERE clan_tag = ?")) {
            ps.setString(1, clanTag.toUpperCase());
            ps.executeUpdate();
        } catch (Exception e) {
            plugin.getLogger().warning("delete failed: " + e.getMessage());
        }
    }

    @Override
    public void appendAudit(String clanTag, String action, String actor, String details) {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(
                     "INSERT INTO audit_logs (clan_tag, action, actor, details, created_at) VALUES (?, ?, ?, ?, ?)")) {
            ps.setString(1, clanTag.toUpperCase());
            ps.setString(2, action);
            ps.setString(3, actor);
            ps.setString(4, details);
            ps.setLong(5, System.currentTimeMillis());
            ps.executeUpdate();
        } catch (Exception e) {
            plugin.getLogger().warning("audit failed: " + e.getMessage());
        }
    }

    // ----- Banners ------------------------------------------------------------

    @Override
    public Optional<ClanBannerRecord> findBannerByClan(String clanTag) {
        String sql = "SELECT clan_tag, base_color, patterns_json, updated_at, updated_by FROM clan_banners WHERE clan_tag = ?";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, clanTag.toUpperCase());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(mapBanner(rs));
                }
            }
        } catch (Exception e) {
            plugin.getLogger().warning("findBannerByClan failed: " + e.getMessage());
        }
        return Optional.empty();
    }

    @Override
    public List<ClanBannerRecord> findAllBanners() {
        List<ClanBannerRecord> list = new ArrayList<>();
        String sql = "SELECT clan_tag, base_color, patterns_json, updated_at, updated_by FROM clan_banners ORDER BY clan_tag";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            while (rs.next()) {
                list.add(mapBanner(rs));
            }
        } catch (Exception e) {
            plugin.getLogger().warning("findAllBanners failed: " + e.getMessage());
        }
        return list;
    }

    @Override
    public void upsertBanner(ClanBannerRecord record) {
        String sql = """
            INSERT INTO clan_banners (clan_tag, base_color, patterns_json, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(clan_tag) DO UPDATE SET
                base_color = excluded.base_color,
                patterns_json = excluded.patterns_json,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by
            """;
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, record.clanTag().toUpperCase());
            ps.setInt(2, record.baseColor());
            ps.setString(3, GSON.toJson(record.patterns()));
            ps.setLong(4, record.updatedAt());
            ps.setString(5, record.updatedBy());
            ps.executeUpdate();
        } catch (Exception e) {
            plugin.getLogger().warning("upsertBanner failed: " + e.getMessage());
        }
    }

    @Override
    public void deleteBanner(String clanTag) {
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement("DELETE FROM clan_banners WHERE clan_tag = ?")) {
            ps.setString(1, clanTag.toUpperCase());
            ps.executeUpdate();
        } catch (Exception e) {
            plugin.getLogger().warning("deleteBanner failed: " + e.getMessage());
        }
    }

    // ----- Helpers ------------------------------------------------------------

    private static ClanCapeRecord mapCape(ResultSet rs) throws Exception {
        return new ClanCapeRecord(
                rs.getString("clan_tag"),
                rs.getString("cape_url"),
                rs.getString("file_name"),
                rs.getLong("updated_at"),
                rs.getString("updated_by")
        );
    }

    private static ClanBannerRecord mapBanner(ResultSet rs) throws Exception {
        String json = rs.getString("patterns_json");
        List<BannerPatternSpec> patterns = json == null || json.isBlank()
                ? List.of()
                : GSON.fromJson(json, PATTERNS_TYPE);
        return new ClanBannerRecord(
                rs.getString("clan_tag"),
                rs.getInt("base_color"),
                patterns,
                rs.getLong("updated_at"),
                rs.getString("updated_by")
        );
    }
}
