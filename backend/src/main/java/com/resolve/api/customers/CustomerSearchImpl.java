package com.resolve.api.customers;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.resolve.api.common.persistence.LikePatterns;
import com.resolve.api.common.persistence.WireEnum;
import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;
import com.resolve.api.common.web.SortDirection;
import com.resolve.api.tickets.TicketStatus;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Lista y búsqueda de clientes con sus recuentos de tickets y su último ticket. Toda consulta parte de la
 * organización; el orden por nombre ignora mayúsculas y todos los órdenes desempatan por id ascendente.
 */
class CustomerSearchImpl implements CustomerSearch {

	// Las subconsultas filtran también por organización (igual que CustomerMetricsQuery): así usan el índice
	// tickets_customer_recent_idx (organization_id, customer_id, …); solo con customer_id recorrerían el índice entero
	// por fila.
	private static final String OPEN_TICKETS = """
			(select count(t) from Ticket t
			 where t.organizationId = c.organizationId and t.customer = c
			   and t.status <> com.resolve.api.tickets.TicketStatus.RESOLVED)
			""";

	private static final String TOTAL_TICKETS = """
			(select count(t) from Ticket t where t.organizationId = c.organizationId and t.customer = c)
			""";

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
			  and (:withoutCompany = false or c.company is null or trim(c.company) = '')
			""";

	/**
	 * El último ticket de cada cliente de la página en una sola consulta (sin N+1): {@code DISTINCT ON} se queda con la
	 * primera fila de cada cliente en el orden de tickets_customer_recent_idx. La organización va en el predicado,
	 * además de en la clave foránea compuesta, para que use ese índice.
	 */
	private static final String LAST_TICKETS = """
			SELECT DISTINCT ON (t.customer_id) t.customer_id, t.number, t.subject, t.status, t.updated_at
			FROM tickets t
			WHERE t.organization_id = :organizationId AND t.customer_id IN (:customerIds)
			ORDER BY t.customer_id, t.updated_at DESC, t.number DESC
			""";

	private final EntityManager entityManager;

	private final JdbcClient jdbc;

	CustomerSearchImpl(EntityManager entityManager, JdbcClient jdbc) {
		this.entityManager = entityManager;
		this.jdbc = jdbc;
	}

	@Override
	public PageResponse<CustomerRow> search(UUID organizationId, CustomerFilters filters,
			PageQuery<CustomerSortField> page) {
		String pattern = (filters.text() == null || filters.text().isBlank()) ? null
				: LikePatterns.contains(filters.text().trim());
		String company = (filters.company() == null || filters.company().isBlank()) ? null : filters.company().trim();
		String where = FILTER + (filters.archived() ? " and c.archivedAt is not null" : " and c.archivedAt is null");
		List<CustomerRow> items = bind(this.entityManager.createQuery(SELECT + where + " order by " + orderBy(page), Object[].class),
				organizationId, pattern, company,
				filters.withoutCompany())
			.setFirstResult((int) page.offset())
			.setMaxResults(page.size())
			.getResultList()
			.stream()
			.map(CustomerSearchImpl::toRow)
			.toList();
		items = withLastTickets(organizationId, items);
		long total = bind(this.entityManager.createQuery("select count(c) " + where, Long.class), organizationId,
				pattern, company, filters.withoutCompany())
			.getSingleResult();
		return PageResponse.of(items, page, total);
	}

	@Override
	public List<CustomerRow> findAllWithCounts(UUID organizationId, Collection<UUID> ids) {
		if (ids.isEmpty()) {
			return List.of();
		}
		List<CustomerRow> rows = this.entityManager
			.createQuery(SELECT + "from Customer c where c.organizationId = :organizationId and c.id in :ids",
					Object[].class)
			.setParameter("organizationId", organizationId)
			.setParameter("ids", ids)
			.getResultList()
			.stream()
			.map(CustomerSearchImpl::toRow)
			.toList();
		return withLastTickets(organizationId, rows);
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

	private List<CustomerRow> withLastTickets(UUID organizationId, List<CustomerRow> rows) {
		if (rows.isEmpty()) {
			return rows;
		}
		List<UUID> ids = rows.stream().map((row) -> row.customer().getId()).toList();
		Map<UUID, LastTicket> byCustomer = new HashMap<>();
		this.jdbc.sql(LAST_TICKETS)
			.param("organizationId", organizationId)
			.param("customerIds", ids)
			.query((result, index) -> {
				byCustomer.put(result.getObject("customer_id", UUID.class),
						new LastTicket(result.getLong("number"), result.getString("subject"),
								WireEnum.fromWire(TicketStatus.class, result.getString("status")).orElseThrow(),
								result.getTimestamp("updated_at").toInstant()));
				return index;
			})
			.list();
		return rows.stream().map((row) -> row.withLastTicket(byCustomer.get(row.customer().getId()))).toList();
	}

	private static <T> TypedQuery<T> bind(TypedQuery<T> query, UUID organizationId, @Nullable String pattern,
			@Nullable String company, boolean withoutCompany) {
		return query.setParameter("organizationId", organizationId)
			.setParameter("pattern", pattern)
			.setParameter("company", company)
			.setParameter("withoutCompany", withoutCompany);
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
