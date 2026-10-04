package com.resolve.api.tickets;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.resolve.api.common.persistence.LikePatterns;
import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;
import com.resolve.api.common.web.SortDirection;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;

/**
 * Consulta de la bandeja. Cada fragmento JPQL es fijo y los valores van siempre como parámetros; el orden solo
 * acepta los campos de {@link TicketSortField}, con desempate por número descendente.
 */
class TicketSearchImpl implements TicketSearch {

	private final EntityManager entityManager;

	TicketSearchImpl(EntityManager entityManager) {
		this.entityManager = entityManager;
	}

	@Override
	public PageResponse<Ticket> search(TicketScope scope, TicketFilters filters, PageQuery<TicketSortField> page) {
		List<String> conditions = new ArrayList<>();
		Map<String, Object> parameters = new HashMap<>();
		conditions.add("t.organizationId = :organizationId");
		parameters.put("organizationId", scope.organizationId());
		if (scope.customerId() != null) {
			conditions.add("c.id = :customerId");
			parameters.put("customerId", scope.customerId());
		}
		switch (filters.view()) {
			case MINE -> {
				conditions.add("a.id = :viewer and t.status <> com.resolve.api.tickets.TicketStatus.RESOLVED");
				parameters.put("viewer", scope.userId());
			}
			case UNASSIGNED -> conditions.add("a is null and t.status <> com.resolve.api.tickets.TicketStatus.RESOLVED");
			case RESOLVED -> conditions.add("t.status = com.resolve.api.tickets.TicketStatus.RESOLVED");
			case ALL -> {
			}
		}
		if (!filters.statuses().isEmpty()) {
			conditions.add("t.status in :statuses");
			parameters.put("statuses", filters.statuses());
		}
		if (!filters.priorities().isEmpty()) {
			conditions.add("t.priority in :priorities");
			parameters.put("priorities", filters.priorities());
		}
		if (filters.assignee() != null) {
			if (filters.assignee().userId() == null) {
				conditions.add("a is null");
			}
			else {
				conditions.add("a.id = :assigneeId");
				parameters.put("assigneeId", filters.assignee().userId());
			}
		}
		if (filters.ticketNumber() != null) {
			conditions.add("t.number = :ticketNumber");
			parameters.put("ticketNumber", filters.ticketNumber());
		}
		else if (filters.text() != null) {
			conditions.add("""
					(lower(t.subject) like :pattern escape '\\' or lower(c.name) like :pattern escape '\\'
					 or lower(c.email) like :pattern escape '\\' or lower(coalesce(c.company, '')) like :pattern escape '\\')""");
			parameters.put("pattern", LikePatterns.contains(filters.text()));
		}

		String where = " where " + String.join(" and ", conditions);
		String direction = (page.sort().direction() == SortDirection.ASC) ? "asc" : "desc";
		String order = " order by " + page.sort().field().expression() + " " + direction + ", t.number desc";

		TypedQuery<Ticket> query = this.entityManager.createQuery(
				"select t from Ticket t join fetch t.customer c left join fetch t.assignee a" + where + order, Ticket.class);
		TypedQuery<Long> count = this.entityManager
			.createQuery("select count(t) from Ticket t join t.customer c left join t.assignee a" + where, Long.class);
		parameters.forEach((name, value) -> {
			query.setParameter(name, value);
			count.setParameter(name, value);
		});
		List<Ticket> items = query.setFirstResult((int) page.offset()).setMaxResults(page.size()).getResultList();
		return PageResponse.of(items, page, count.getSingleResult());
	}

}
