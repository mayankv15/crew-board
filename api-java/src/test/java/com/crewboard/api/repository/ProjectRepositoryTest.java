package com.crewboard.api.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.crewboard.api.model.Project;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.jdbc.JdbcTest;
import org.springframework.context.annotation.Import;

@JdbcTest(properties = "spring.datasource.url=jdbc:sqlite:file:projectrepotest?mode=memory&cache=shared")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ProjectRepository.class)
class ProjectRepositoryTest {
  @Autowired private ProjectRepository repository;

  @Test
  void findAllIsEmptyWhenNothingIsSaved() {
    assertTrue(repository.findAll().isEmpty());
  }

  @Test
  void aSavedProjectComesBackWithEveryField() {
    Project saved = new Project("p1", "Chiller Install", "Acme", "Dallas", "2026-10-28T10:00:00.000Z");

    repository.insert(saved);

    assertEquals(List.of(saved), repository.findAll());
  }

  @Test
  void newestProjectComesFirst() {
    repository.insert(new Project("old", "Old", "Acme", "Dallas", "2026-10-01T00:00:00.000Z"));
    repository.insert(new Project("new", "New", "Acme", "Dallas", "2026-10-28T00:00:00.000Z"));

    List<String> ids = repository.findAll().stream().map(Project::id).toList();

    assertEquals(List.of("new", "old"), ids);
  }
}
