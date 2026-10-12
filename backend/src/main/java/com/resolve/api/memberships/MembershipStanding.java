package com.resolve.api.memberships;

/** Rol y estado de una membresía, leídos sin cargar ni bloquear la fila. */
public record MembershipStanding(Role role, MemberStatus status) {
}
