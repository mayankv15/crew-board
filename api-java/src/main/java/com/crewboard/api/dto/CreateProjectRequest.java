package com.crewboard.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateProjectRequest(
    @NotBlank @Size(max = 120) String name,
    @NotBlank @Size(max = 120) String client,
    @NotBlank @Size(max = 120) String site) {}
