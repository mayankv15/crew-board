package com.crewboard.api.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.crewboard.api.model.Project;
import com.crewboard.api.service.ProjectService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ProjectController.class)
class ProjectControllerTest {
  private static final Project PROJECT =
      new Project("p1", "Chiller Install", "Acme", "Dallas", "2026-10-28T10:00:00.000Z");

  @Autowired private MockMvc mvc;

  @MockitoBean private ProjectService projectService;

  @Test
  void listReturnsAJsonArray() throws Exception {
    when(projectService.list()).thenReturn(List.of(PROJECT));

    mvc.perform(get("/projects"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].id").value("p1"))
        .andExpect(jsonPath("$[0].createdAt").value("2026-10-28T10:00:00.000Z"));
  }

  @Test
  void createReturns201AndTheNewProject() throws Exception {
    when(projectService.create(any())).thenReturn(PROJECT);

    mvc.perform(
            post("/projects")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Chiller Install\",\"client\":\"Acme\",\"site\":\"Dallas\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").value("p1"));
  }

  @Test
  void createRejectsABlankNameWith400AndNeverCallsTheService() throws Exception {
    mvc.perform(
            post("/projects")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"   \",\"client\":\"Acme\",\"site\":\"Dallas\"}"))
        .andExpect(status().isBadRequest());

    verifyNoInteractions(projectService);
  }

  @Test
  void createRejectsAMissingFieldWith400() throws Exception {
    mvc.perform(
            post("/projects")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Chiller Install\",\"client\":\"Acme\"}"))
        .andExpect(status().isBadRequest());
  }
}
