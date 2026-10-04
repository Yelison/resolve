package com.resolve.api.common.security;

import java.util.UUID;

import com.resolve.api.memberships.Role;
import org.jspecify.annotations.Nullable;

/**
 * Principal autenticado: usuario, organización y rol. Todo acceso a datos se limita a {@link #organizationId()};
 * la API nunca acepta una organización enviada por el cliente.
 */
public record CurrentMember(UUID userId, String name, String email, UUID organizationId, Role role,
		@Nullable UUID customerId) {

	public boolean isStaff() {
		return this.role.isStaff();
	}

}
