package com.crewboard.api.service;

import com.crewboard.api.repository.HealthRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

@Service
public class HealthService {
  private static final Logger log = LoggerFactory.getLogger(HealthService.class);

  private final HealthRepository healthRepository;

  public HealthService(HealthRepository healthRepository) {
    this.healthRepository = healthRepository;
  }

  public boolean isReady() {
    try {
      healthRepository.ping();
      return true;
    } catch (DataAccessException e) {
      log.error("Readiness check failed: database is not reachable", e);
      return false;
    }
  }

  public String status() {
    log.debug("Computing health status");
    return "ok";
  }
}
