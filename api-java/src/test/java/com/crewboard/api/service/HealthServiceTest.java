package com.crewboard.api.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

import com.crewboard.api.repository.HealthRepository;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

class HealthServiceTest {
  private final HealthRepository repository = mock(HealthRepository.class);
  private final HealthService service = new HealthService(repository);

  @Test
  void isReadyWhenThePingSucceeds() {
    assertTrue(service.isReady());
  }

  @Test
  void isNotReadyWhenThePingFails() {
    doThrow(new DataAccessResourceFailureException("db down")).when(repository).ping();

    assertFalse(service.isReady());
  }
}
