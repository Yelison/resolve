package com.resolve.api.tickets;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

/** Sin métodos heredados sin filtro: toda lectura recibe la organización. */
interface TicketMessageRepository extends Repository<TicketMessage, UUID> {

	TicketMessage save(TicketMessage entity);

	@Query("""
			select m from TicketMessage m left join fetch m.authorUser left join fetch m.authorCustomer
			where m.organizationId = :organizationId and m.ticketId = :ticketId
			order by m.createdAt, m.id
			""")
	List<TicketMessage> findConversation(UUID organizationId, UUID ticketId);

	/** Conversación para clientes: las notas internas se excluyen en la consulta, no después. */
	@Query("""
			select m from TicketMessage m left join fetch m.authorUser left join fetch m.authorCustomer
			where m.organizationId = :organizationId and m.ticketId = :ticketId
				and m.visibility = com.resolve.api.tickets.MessageVisibility.PUBLIC
			order by m.createdAt, m.id
			""")
	List<TicketMessage> findPublicConversation(UUID organizationId, UUID ticketId);

}
