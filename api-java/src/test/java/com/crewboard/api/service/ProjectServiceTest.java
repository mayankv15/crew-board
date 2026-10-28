package com.crewboard.api.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.crewboard.api.dto.CreateProjectRequest;
import com.crewboard.api.model.Project;
import com.crewboard.api.repository.ProjectRepository;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class ProjectServiceTest {
  private final ProjectRepository repository = mock(ProjectRepository.class);
  private final ProjectService service = new ProjectService(repository);

  @Test
  void createTrimsTheTextAndFillsInTheIdAndTime() {
    Project created = service.create(new CreateProjectRequest("  Chiller Install ", " Acme", "Dallas  "));

    ArgumentCaptor<Project> saved = ArgumentCaptor.forClass(Project.class);
    verify(repository).insert(saved.capture());

    assertEquals(created, saved.getValue());
    assertEquals("Chiller Install", created.name());
    assertEquals("Acme", created.client());
    assertEquals("Dallas", created.site());
    UUID.fromString(created.id());
    assertTrue(created.createdAt().matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z"));
  }
}
