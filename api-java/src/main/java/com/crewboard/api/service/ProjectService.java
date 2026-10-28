package com.crewboard.api.service;

import com.crewboard.api.dto.CreateProjectRequest;
import com.crewboard.api.model.Project;
import com.crewboard.api.repository.ProjectRepository;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ProjectService {
  private static final Logger log = LoggerFactory.getLogger(ProjectService.class);

  private static final DateTimeFormatter ISO_MILLIS =
      DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

  private final ProjectRepository projectRepository;

  public ProjectService(ProjectRepository projectRepository) {
    this.projectRepository = projectRepository;
  }

  public Project create(CreateProjectRequest request) {
    Project project =
        new Project(
            UUID.randomUUID().toString(),
            request.name().trim(),
            request.client().trim(),
            request.site().trim(),
            ISO_MILLIS.format(Instant.now()));
    projectRepository.insert(project);
    log.info("Created project {} ({})", project.id(), project.name());
    return project;
  }

  public List<Project> list() {
    return projectRepository.findAll();
  }
}
