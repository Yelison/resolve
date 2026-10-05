package com.resolve.api.tickets;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Limit;
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

	/** Las últimas entradas de toda la organización con el ticket al que pertenecen, de la más reciente a la más antigua. */
	@Query("""
			select new com.resolve.api.tickets.ActivityFeedRow(a, t.number, t.subject)
			from TicketActivity a join Ticket t on t.id = a.ticketId and t.organizationId = a.organizationId
			where a.organizationId = :organizationId
			order by a.createdAt desc, a.id desc
			""")
	List<ActivityFeedRow> findFeed(UUID organizationId, Limit limit);

}
