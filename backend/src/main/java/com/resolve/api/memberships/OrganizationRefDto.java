package com.resolve.api.memberships;

import java.util.UUID;

/** Organización donde alguien puede trabajar ({@code OrganizationRef} en el contrato). */
public record OrganizationRefDto(UUID id, String name) {
}
