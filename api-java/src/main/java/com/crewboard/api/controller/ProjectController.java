package com.crewboard.api.controller;

import com.crewboard.api.dto.CreateProjectRequest;
import com.crewboard.api.model.Project;
import com.crewboard.api.service.ProjectService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ProjectController {
  private final ProjectService projectService;

  public ProjectController(ProjectService projectService) {
    this.projectService = projectService;
  }

  @GetMapping("/projects")
  public List<Project> list() {
    return projectService.list();
  }

  @PostMapping("/projects")
  @ResponseStatus(HttpStatus.CREATED)
  public Project create(@Valid @RequestBody CreateProjectRequest body) {
    return projectService.create(body);
  }
}
