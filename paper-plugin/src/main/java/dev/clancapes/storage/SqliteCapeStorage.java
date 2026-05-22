package dev.clancapes.storage;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import dev.clancapes.ClanCapesPlugin;
import dev.clancapes.model.ClanCapeRecord;

import java.io.File;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public final class SqliteCapeStorage implements CapeStorage {
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

        try (Connection conn = dataSource.getConnection()) {
            conn.createStatement().execute("""
                CREATE TABLE IF NOT EXISTS clan_capes (
                    clan_tag TEXT PRIMARY KEY,
                    cape_url TEXT NOT NULL,
                    file_name TEXT,
                    updated_at INTEGER NOT NULL,
                    updated_by TEXT
                );
                """);
            conn.createStatement().execute("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    clan_tag TEXT NOT NULL,
                    action TEXT NOT NULL,
                    actor TEXT,
                    details TEXT,
                    created_at INTEGER NOT NULL
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

    @Override
    public Optional<ClanCapeRecord> findByClan(String clanTag) {
        String sql = "SELECT clan_tag, cape_url, file_name, updated_at, updated_by FROM clan_capes WHERE clan_tag = ?";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, clanTag.toUpperCase());
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(map(rs));
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
                list.add(map(rs));
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

    private static ClanCapeRecord map(ResultSet rs) throws Exception {
        return new ClanCapeRecord(
                rs.getString("clan_tag"),
                rs.getString("cape_url"),
                rs.getString("file_name"),
                rs.getLong("updated_at"),
                rs.getString("updated_by")
        );
    }
}
