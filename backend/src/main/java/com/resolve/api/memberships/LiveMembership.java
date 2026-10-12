package com.resolve.api.memberships;

import java.util.UUID;

import org.jspecify.annotations.Nullable;

/** Rol y cliente enlazado de una membresía que no está retirada, leídos sin cargar la fila. */
public record LiveMembership(Role role, @Nullable UUID customerId) {
}
