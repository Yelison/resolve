package com.resolve.api.memberships;

import java.util.UUID;

import org.jspecify.annotations.Nullable;

/**
 * Organización donde alguien puede trabajar ({@code OrganizationRef} en el contrato): con el rol que tiene allí, su
 * color ({@code OrganizationColors}) y cuántas personas activas del equipo (administradores y agentes) la forman, o
 * {@code null} si es una membresía de cliente, que no ve el equipo.
 */
public record OrganizationRefDto(UUID id, String name, Role role, String color, @Nullable Integer memberCount) {
}
