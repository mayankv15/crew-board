package com.crewboard.api.controller;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.crewboard.api.service.HealthService;

@RestController
public class HealthController {
  private static final Logger log = LoggerFactory.getLogger(HealthController.class);

  private final HealthService healthService;

  public HealthController(HealthService healthService) {
    this.healthService = healthService;
  }

  @GetMapping("/health")
  public Map<String, String> health() {
    String status = healthService.status();
    log.debug("GET /health answered with status {}", status);
    return Map.of("status", status);
  }

  @GetMapping("/ready")
  public ResponseEntity<Map<String, String>> ready() {
    if (healthService.isReady()) {
      return ResponseEntity.ok(Map.of("status", "ready"));
    }
    return ResponseEntity.status(503).body(Map.of("status", "unavailable"));
  }
}
