package com.resolve.api.customers;

import java.util.Optional;
import java.util.UUID;

import com.resolve.api.common.persistence.LikePatterns;
import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;
import com.resolve.api.common.web.SortDirection;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import org.jspecify.annotations.Nullable;

/**
 * Lista y búsqueda de clientes con sus recuentos de tickets. Toda consulta parte de la organización; el orden por
 * nombre ignora mayúsculas y todos los órdenes desempatan por id ascendente.
 */
class CustomerSearchImpl implements CustomerSearch {

	private static final String OPEN_TICKETS = """
			(select count(t) from Ticket t
			 where t.customer = c and t.status <> com.resolve.api.tickets.TicketStatus.RESOLVED)
			""";

	private static final String TOTAL_TICKETS = "(select count(t) from Ticket t where t.customer = c)";

	private static final String SELECT = "select c, " + OPEN_TICKETS + " as openTickets, " + TOTAL_TICKETS
			+ " as totalTickets ";

	private static final String FILTER = """
			from Customer c
			where c.organizationId = :organizationId
			  and (:pattern is null
			       or lower(c.name) like :pattern escape '\\'
			       or lower(c.email) like :pattern escape '\\'
			       or lower(coalesce(c.company, '')) like :pattern escape '\\')
			  and (:company is null or lower(c.company) = lower(cast(:company as string)))
			""";

	private final EntityManager entityManager;

	CustomerSearchImpl(EntityManager entityManager) {
		this.entityManager = entityManager;
	}

	@Override
	public PageResponse<CustomerRow> search(UUID organizationId, CustomerFilters filters,
			PageQuery<CustomerSortField> page) {
		String pattern = (filters.text() == null || filters.text().isBlank()) ? null
				: LikePatterns.contains(filters.text().trim());
		String company = (filters.company() == null || filters.company().isBlank()) ? null : filters.company().trim();
		String where = FILTER + (filters.archived() ? " and c.archivedAt is not null" : " and c.archivedAt is null");
		var items = bind(this.entityManager.createQuery(SELECT + where + " order by " + orderBy(page), Object[].class),
				organizationId, pattern, company)
			.setFirstResult((int) page.offset())
			.setMaxResults(page.size())
			.getResultList()
			.stream()
			.map(CustomerSearchImpl::toRow)
			.toList();
		long total = bind(this.entityManager.createQuery("select count(c) " + where, Long.class), organizationId,
				pattern, company)
			.getSingleResult();
		return PageResponse.of(items, page, total);
	}

	@Override
	public Optional<CustomerRow> findWithCounts(UUID organizationId, UUID id) {
		var rows = this.entityManager
			.createQuery(SELECT + "from Customer c where c.organizationId = :organizationId and c.id = :id",
					Object[].class)
			.setParameter("organizationId", organizationId)
			.setParameter("id", id)
			.getResultList();
		return rows.stream().findFirst().map(CustomerSearchImpl::toRow);
	}

	private static <T> TypedQuery<T> bind(TypedQuery<T> query, UUID organizationId, @Nullable String pattern,
			@Nullable String company) {
		return query.setParameter("organizationId", organizationId)
			.setParameter("pattern", pattern)
			.setParameter("company", company);
	}

	private static String orderBy(PageQuery<CustomerSortField> page) {
		String direction = (page.sort().direction() == SortDirection.DESC) ? "desc" : "asc";
		String field = switch (page.sort().field()) {
			case NAME -> "lower(c.name)";
			case CREATED_AT -> "c.createdAt";
			case OPEN_TICKETS -> "openTickets";
		};
		return field + " " + direction + ", c.id asc";
	}

	private static CustomerRow toRow(Object[] row) {
		return new CustomerRow((Customer) row[0], (Long) row[1], (Long) row[2]);
	}

}
