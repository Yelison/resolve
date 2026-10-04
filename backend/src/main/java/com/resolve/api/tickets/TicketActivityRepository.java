package com.resolve.api.tickets;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

/** Sin métodos heredados sin filtro: toda lectura recibe la organización. */
interface TicketActivityRepository extends Repository<TicketActivity, UUID> {

	TicketActivity save(TicketActivity entity);

	@Query("""
			select a from TicketActivity a
			where a.organizationId = :organizationId and a.ticketId = :ticketId
			order by a.createdAt desc, a.id desc
			""")
	List<TicketActivity> findHistory(UUID organizationId, UUID ticketId);

}
