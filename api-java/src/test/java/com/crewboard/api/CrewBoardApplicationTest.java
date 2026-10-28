package com.crewboard.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "spring.datasource.url=jdbc:sqlite::memory:")
@AutoConfigureMockMvc
class CrewBoardApplicationTest {
  @Autowired private MockMvc mvc;

  @Test
  void startsAndReportsHealthy() throws Exception {
    mvc.perform(get("/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ok"));
  }

  @Test
  void isReadyBecauseTheRealDatabaseAnswers() throws Exception {
    mvc.perform(get("/ready")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ready"));
  }
}
