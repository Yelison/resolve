package com.resolve.api.memberships;

import java.time.Instant;
import java.util.UUID;

import com.resolve.api.common.security.CurrentMember;

/**
 * Puerto que implementa el módulo de tickets: retirar a un miembro libera sus tickets sin resolver. Lo declara
 * {@code memberships} para no depender de {@code tickets}.
 */
public interface AssignedTicketReleaser {

	/**
	 * Quita el responsable a todos los tickets sin resolver asignados al usuario, con una entrada de historial
	 * {@code assignee_changed} por ticket cuyo actor es {@code actor}. Se une a la transacción en curso.
	 * @return los tickets liberados
	 */
	int releaseOpenTickets(CurrentMember actor, UUID userId, Instant now);

}
