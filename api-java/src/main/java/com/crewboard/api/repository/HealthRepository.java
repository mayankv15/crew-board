package com.crewboard.api.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class HealthRepository {
  private final JdbcTemplate jdbc;

  public HealthRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void ping() {
    jdbc.queryForObject("SELECT 1", Integer.class);
  }
}
