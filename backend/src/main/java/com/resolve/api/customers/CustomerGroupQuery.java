package com.resolve.api.customers;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.resolve.api.common.persistence.LikePatterns;
import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;
import com.resolve.api.common.web.SortDirection;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Los clientes agrupados por empresa y paginados por empresa: una empresa nunca queda partida entre dos páginas. Una
 * consulta da las empresas de la página con sus totales, otra los primeros clientes de cada una en el orden pedido, y los
 * clientes se leen en bloque con sus recuentos y su último ticket (sin una consulta por empresa ni por cliente). Toda
 * consulta parte de la organización; las de tickets además la repiten en el predicado para usar el índice
 * {@code tickets_customer_recent_idx}.
 */
@Component
class CustomerGroupQuery {

	/** Clientes de cada empresa que se muestran en la página; el resto está tras «Ver los N clientes». */
	static final int PREVIEW = 3;

	/**
	 * Empresa de un cliente sin distinguir mayúsculas ni espacios, como las cuenta {@code CustomerMetricsQuery}; sin empresa
	 * (o en blanco) es {@code NULL}.
	 */
	private static final String GROUP_KEY = "CASE WHEN btrim(coalesce(c.company, '')) = '' THEN NULL ELSE lower(btrim(c.company)) END";

	private static final String OPEN_TICKETS = """
			(SELECT count(*) FROM tickets t
			 WHERE t.organization_id = c.organization_id AND t.customer_id = c.id AND t.status <> 'resolved')
			""";

	private final JdbcClient jdbc;

	private final CustomerRepository customers;

	CustomerGroupQuery(JdbcClient jdbc, CustomerRepository customers) {
		this.jdbc = jdbc;
		this.customers = customers;
	}

	PageResponse<CustomerGroupRow> page(UUID organizationId, CustomerFilters filters,
			PageQuery<CustomerSortField> page) {
		Matching matching = matching(organizationId, filters);
		// Primero las empresas de la página, sin tocar los tickets: el total sale de la misma consulta (ventana sobre los
		// grupos, antes del LIMIT).
		long[] total = { -1 };
		List<GroupTotals> groups = matching.bind(this.jdbc.sql("""
				SELECT m.grp, min(btrim(m.company)) AS company, count(*) AS customer_count, count(*) OVER () AS total
				FROM (SELECT c.id, c.company, %s AS grp %s) m
				GROUP BY m.grp
				ORDER BY m.grp NULLS LAST
				LIMIT :limit OFFSET :offset
				""".formatted(GROUP_KEY, matching.from())))
			.param("limit", page.size())
			.param("offset", page.offset())
			.query((row, index) -> {
				total[0] = row.getLong("total");
				return new GroupTotals(row.getString("grp"), row.getString("company"), row.getLong("customer_count"), 0);
			})
			.list();
		if (groups.isEmpty()) {
			// Una página pasada la última no trae filas, y con ellas el total: se cuenta aparte.
			total[0] = (page.offset() == 0) ? 0 : matching.bind(this.jdbc.sql("""
					SELECT count(*) FROM (SELECT 1 FROM (SELECT %s AS grp %s) m GROUP BY m.grp) groups
					""".formatted(GROUP_KEY, matching.from()))).query(Long.class).single();
		}
		Map<String, Long> openByGroup = openTickets(matching, groups);
		Map<String, List<UUID>> previews = previews(organizationId, matching, page, groups);
		Map<UUID, CustomerRow> rows = new HashMap<>();
		this.customers.findAllWithCounts(organizationId, previews.values().stream().flatMap(List::stream).toList())
			.forEach((row) -> rows.put(row.customer().getId(), row));
		List<CustomerGroupRow> items = groups.stream()
			.map((group) -> new CustomerGroupRow(blankToNull(group.company()), group.customerCount(),
					openByGroup.getOrDefault(keyOf(group.key()), 0L),
					previews.getOrDefault(keyOf(group.key()), List.of()).stream().map(rows::get).toList()))
			.toList();
		return PageResponse.of(items, page, total[0]);
	}

	/** Los tickets abiertos de cada empresa de la página: solo se cuentan los de sus clientes, no los de las demás. */
	private Map<String, Long> openTickets(Matching matching, List<GroupTotals> groups) {
		Map<String, Long> open = new HashMap<>();
		if (groups.isEmpty()) {
			return open;
		}
		var statement = matching.bind(this.jdbc.sql("""
				SELECT m.grp, coalesce(sum((SELECT count(*) FROM tickets t
				                            WHERE t.organization_id = :organizationId AND t.customer_id = m.id
				                              AND t.status <> 'resolved')), 0) AS open_tickets
				FROM (SELECT c.id, %s AS grp %s) m
				WHERE %s
				GROUP BY m.grp
				""".formatted(GROUP_KEY, matching.from(), inPage(groups))));
		statement = bindKeys(statement, groups);
		statement.query((row, index) -> {
			open.put(keyOf(row.getString("grp")), row.getLong("open_tickets"));
			return index;
		}).list();
		return open;
	}

	/** Condición «el cliente es de una de las empresas de la página» sobre la columna {@code m.grp}. */
	private static String inPage(List<GroupTotals> groups) {
		boolean keys = groups.stream().anyMatch((group) -> group.key() != null);
		boolean withoutCompany = groups.stream().anyMatch((group) -> group.key() == null);
		return (keys ? "m.grp IN (:keys)" : "false") + (withoutCompany ? " OR m.grp IS NULL" : "");
	}

	private static JdbcClient.StatementSpec bindKeys(JdbcClient.StatementSpec statement, List<GroupTotals> groups) {
		List<String> keys = groups.stream().map(GroupTotals::key).filter((key) -> key != null).toList();
		return keys.isEmpty() ? statement : statement.param("keys", keys);
	}

	/** Los ids de los primeros {@link #PREVIEW} clientes de cada empresa de la página, en el orden pedido. */
	private Map<String, List<UUID>> previews(UUID organizationId, Matching matching, PageQuery<CustomerSortField> page,
			List<GroupTotals> groups) {
		Map<String, List<UUID>> previews = new LinkedHashMap<>();
		if (groups.isEmpty()) {
			return previews;
		}
		String direction = (page.sort().direction() == SortDirection.DESC) ? "DESC" : "ASC";
		String sort = switch (page.sort().field()) {
			case NAME -> "lower(m.name)";
			case CREATED_AT -> "m.created_at";
			case OPEN_TICKETS -> "m.open_tickets";
		};
		// Los tickets solo se cuentan para ordenar por ellos.
		String open = (page.sort().field() == CustomerSortField.OPEN_TICKETS) ? OPEN_TICKETS : "0";
		var statement = matching.bind(this.jdbc.sql("""
				SELECT ranked.id, ranked.grp FROM (
				  SELECT m.id, m.grp, row_number() OVER (PARTITION BY m.grp ORDER BY %s %s, m.id ASC) AS position
				  FROM (SELECT c.id, c.name, c.created_at, %s AS grp, %s AS open_tickets %s) m
				  WHERE %s
				) ranked
				WHERE ranked.position <= %d
				ORDER BY ranked.grp NULLS LAST, ranked.position
				""".formatted(sort, direction, GROUP_KEY, open, matching.from(), inPage(groups), PREVIEW)));
		statement = bindKeys(statement, groups);
		statement.query((row, index) -> {
			previews.computeIfAbsent(keyOf(row.getString("grp")), (key) -> new ArrayList<>())
				.add(row.getObject("id", UUID.class));
			return index;
		}).list();
		return previews;
	}

	private static String keyOf(@Nullable String key) {
		return (key == null) ? "" : key;
	}

	private static @Nullable String blankToNull(@Nullable String company) {
		return (company == null || company.isBlank()) ? null : company;
	}

	/** Cláusula {@code FROM … WHERE} común a las consultas, con sus parámetros. */
	private static Matching matching(UUID organizationId, CustomerFilters filters) {
		String pattern = (filters.text() == null || filters.text().isBlank()) ? null
				: LikePatterns.contains(filters.text().trim());
		StringBuilder from = new StringBuilder("FROM customers c WHERE c.organization_id = :organizationId");
		from.append(filters.archived() ? " AND c.archived_at IS NOT NULL" : " AND c.archived_at IS NULL");
		if (pattern != null) {
			from.append(" AND (lower(c.name) LIKE :pattern ESCAPE '\\'")
				.append(" OR lower(c.email) LIKE :pattern ESCAPE '\\'")
				.append(" OR lower(coalesce(c.company, '')) LIKE :pattern ESCAPE '\\')");
		}
		return new Matching(from.toString(), organizationId, pattern);
	}

	private record Matching(String from, UUID organizationId, @Nullable String pattern) {

		JdbcClient.StatementSpec bind(JdbcClient.StatementSpec statement) {
			JdbcClient.StatementSpec bound = statement.param("organizationId", this.organizationId);
			return (this.pattern == null) ? bound : bound.param("pattern", this.pattern);
		}

	}

	private record GroupTotals(@Nullable String key, @Nullable String company, long customerCount, long openTickets) {
	}

}
