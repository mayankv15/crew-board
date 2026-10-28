package com.crewboard.api.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.crewboard.api.service.HealthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(HealthController.class)
class HealthControllerTest {
  @Autowired private MockMvc mvc;

  @MockitoBean private HealthService healthService;

  @Test
  void healthReturnsWhatTheServiceSays() throws Exception {
    when(healthService.status()).thenReturn("up");

    mvc.perform(get("/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("up"));
  }

  @Test
  void readyReturns200WhenTheDatabaseAnswers() throws Exception {
    when(healthService.isReady()).thenReturn(true);

    mvc.perform(get("/ready")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ready"));
  }

  @Test
  void readyReturns503WhenTheDatabaseIsDown() throws Exception {
    when(healthService.isReady()).thenReturn(false);

    mvc.perform(get("/ready"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.status").value("unavailable"));
  }
}
