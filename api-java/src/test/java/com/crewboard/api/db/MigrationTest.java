package com.crewboard.api.db;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

@JdbcTest(properties = "spring.datasource.url=jdbc:sqlite:file:migrationtest?mode=memory&cache=shared")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class MigrationTest {
  @Autowired private JdbcTemplate jdbc;

  @Test
  void migrationCreatesTheProjectsTable() {
    Integer found =
        jdbc.queryForObject(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'projects'",
            Integer.class);

    assertEquals(1, found);
  }

  @Test
  void flywayRecordedMigrationOne() {
    Integer applied =
        jdbc.queryForObject(
            "SELECT count(*) FROM flyway_schema_history WHERE version = '1' AND success = 1",
            Integer.class);

    assertEquals(1, applied);
  }

  @Test
  void databaseRejectsAProjectWithAnEmptyName() {
    assertThrows(
        DataAccessException.class,
        () ->
            jdbc.update(
                "INSERT INTO projects (id, name, client, site, created_at) VALUES (?, ?, ?, ?, ?)",
                "p1",
                "",
                "Acme",
                "Dallas",
                "2026-10-28T00:00:00Z"));
  }
}
