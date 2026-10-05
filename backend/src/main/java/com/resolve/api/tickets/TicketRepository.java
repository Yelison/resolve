package com.resolve.api.tickets;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.Lock;
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

	/**
	 * Como {@link #findInOrganization} pero con {@code PESSIMISTIC_WRITE}, que Hibernate emite en PostgreSQL como
	 * {@code SELECT … FOR NO KEY UPDATE}: la fila queda bloqueada hasta el final de la transacción. Choca con otro
	 * bloqueo igual y con el {@code UPDATE} de {@link #touchPublicActivity}, pero no con el {@code FOR KEY SHARE} del
	 * {@code INSERT} de un mensaje: una nota interna no espera al PATCH y una respuesta pública solo espera en el
	 * {@code UPDATE}. Sin {@code join fetch}: PostgreSQL no admite bloqueo de filas sobre el lado nullable de un outer
	 * join; cliente y responsable se cargan después, de forma perezosa, dentro de la transacción.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select t from Ticket t
			where t.organizationId = :organizationId and t.number = :number
			""")
	Optional<Ticket> lockInOrganization(UUID organizationId, long number);

	/** Versión con bloqueo de {@link #findForCustomer}; filtra por la clave foránea, sin join. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select t from Ticket t
			where t.organizationId = :organizationId and t.number = :number and t.customer.id = :customerId
			""")
	Optional<Ticket> lockForCustomer(UUID organizationId, UUID customerId, long number);

	/**
	 * Tickets sin resolver de un responsable, con la fila bloqueada, para liberarlos al retirarlo del equipo. Sin
	 * {@code join fetch}, por el mismo motivo que {@link #lockInOrganization}; en orden de número para que dos
	 * transacciones que bloqueen varios tickets lo hagan siempre en el mismo orden.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("""
			select t from Ticket t
			where t.organizationId = :organizationId and t.assignee.id = :assigneeId
				and t.status <> com.resolve.api.tickets.TicketStatus.RESOLVED
			order by t.number
			""")
	List<Ticket> lockOpenAssignedTo(UUID organizationId, UUID assigneeId);

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
