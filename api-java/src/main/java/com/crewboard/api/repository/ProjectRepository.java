package com.crewboard.api.repository;

import com.crewboard.api.model.Project;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class ProjectRepository {
  private static final RowMapper<Project> TO_PROJECT =
      (rs, rowNum) ->
          new Project(
              rs.getString("id"),
              rs.getString("name"),
              rs.getString("client"),
              rs.getString("site"),
              rs.getString("created_at"));

  private final JdbcTemplate jdbc;

  public ProjectRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public void insert(Project project) {
    jdbc.update(
        "INSERT INTO projects (id, name, client, site, created_at) VALUES (?, ?, ?, ?, ?)",
        project.id(),
        project.name(),
        project.client(),
        project.site(),
        project.createdAt());
  }

  public List<Project> findAll() {
    return jdbc.query(
        "SELECT id, name, client, site, created_at FROM projects ORDER BY created_at DESC, id",
        TO_PROJECT);
  }
}
