package com.crewboard.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite:file:projectendtoend?mode=memory&cache=shared")
@AutoConfigureMockMvc
class ProjectEndToEndTest {
  @Autowired private MockMvc mvc;

  @Test
  void aCreatedProjectAppearsInTheList() throws Exception {
    mvc.perform(
            post("/projects")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\" Chiller Install \",\"client\":\"Acme\",\"site\":\"Dallas\"}"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.name").value("Chiller Install"));

    mvc.perform(get("/projects"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].name").value("Chiller Install"))
        .andExpect(jsonPath("$[0].client").value("Acme"));
  }
}
