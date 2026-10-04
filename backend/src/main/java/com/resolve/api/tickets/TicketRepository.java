package com.resolve.api.tickets;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

/**
 * Solo expone métodos acotados por organización: no hereda {@code findById} ni {@code findAll}, así que no existe
 * acceso a un ticket sin la organización del principal.
 */
interface TicketRepository extends Repository<Ticket, UUID>, TicketSearch {

	Ticket save(Ticket ticket);

	void flush();

	@Query("""
			select t from Ticket t join fetch t.customer left join fetch t.assignee
			where t.organizationId = :organizationId and t.number = :number
			""")
	Optional<Ticket> findInOrganization(UUID organizationId, long number);

	@Query("""
			select t from Ticket t join fetch t.customer c left join fetch t.assignee
			where t.organizationId = :organizationId and t.number = :number and c.id = :customerId
			""")
	Optional<Ticket> findForCustomer(UUID organizationId, UUID customerId, long number);

	/** Reserva el siguiente número de la organización; la fila queda bloqueada hasta el final de la transacción. */
	@Query(value = """
			UPDATE organizations SET next_ticket_number = next_ticket_number + 1
			WHERE id = :organizationId
			RETURNING next_ticket_number - 1
			""", nativeQuery = true)
	long allocateNumber(UUID organizationId);

	/** Registra actividad pública sin cambiar la versión: una respuesta no invalida un cambio de estado paralelo. */
	@Modifying(flushAutomatically = true, clearAutomatically = true)
	@Query("""
			update Ticket t set t.updatedAt = greatest(t.updatedAt, :at),
				t.firstResponseAt = case when :firstResponse = true and t.firstResponseAt is null then :at
					else t.firstResponseAt end
			where t.id = :ticketId
			""")
	void touchPublicActivity(UUID ticketId, Instant at, boolean firstResponse);

}
