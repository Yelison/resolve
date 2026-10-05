package com.resolve.api.customers;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import com.resolve.api.customers.CustomerDtos.CustomerMetricsDto;
import com.resolve.api.organizations.OrganizationRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Métricas y empresas de los clientes activos de una organización, independientes de los filtros de la lista. El mes
 * en curso se calcula en la zona horaria de la organización.
 */
@Component
class CustomerMetricsQuery {

	static final int MAX_COMPANIES = 200;

	private static final String COUNTS = """
			SELECT
			  count(*) AS total,
			  count(DISTINCT lower(c.company)) FILTER (WHERE btrim(c.company) <> '') AS companies,
			  count(*) FILTER (WHERE EXISTS (
			      SELECT 1 FROM tickets t
			      WHERE t.organization_id = c.organization_id AND t.customer_id = c.id AND t.status <> 'resolved'
			  )) AS with_open_tickets,
			  count(*) FILTER (WHERE c.created_at >= :monthStart AND c.created_at < :nextMonthStart) AS new_this_month
			FROM customers c
			WHERE c.organization_id = :organizationId AND c.archived_at IS NULL
			""";

	/** Una vez por nombre sin distinguir mayúsculas; si varían, gana la primera en orden binario (mayúsculas antes). */
	private static final String COMPANIES = """
			SELECT min(c.company) AS company
			FROM customers c
			WHERE c.organization_id = :organizationId AND c.archived_at IS NULL AND btrim(c.company) <> ''
			GROUP BY lower(c.company)
			ORDER BY lower(c.company), min(c.company)
			LIMIT :limit
			""";

	private final JdbcClient jdbc;

	private final OrganizationRepository organizations;

	private final Clock clock;

	CustomerMetricsQuery(JdbcClient jdbc, OrganizationRepository organizations, Clock clock) {
		this.jdbc = jdbc;
		this.organizations = organizations;
		this.clock = clock;
	}

	CustomerMetricsDto compute(UUID organizationId) {
		ZoneId zone = this.organizations.findById(organizationId).orElseThrow().zone();
		LocalDate firstOfMonth = LocalDate.now(this.clock.withZone(zone)).withDayOfMonth(1);
		Timestamp monthStart = Timestamp.from(firstOfMonth.atStartOfDay(zone).toInstant());
		Timestamp nextMonthStart = Timestamp.from(firstOfMonth.plusMonths(1).atStartOfDay(zone).toInstant());
		return this.jdbc.sql(COUNTS)
			.param("organizationId", organizationId)
			.param("monthStart", monthStart)
			.param("nextMonthStart", nextMonthStart)
			.query((row, index) -> new CustomerMetricsDto(row.getInt("total"), row.getInt("companies"),
					row.getInt("with_open_tickets"), row.getInt("new_this_month")))
			.single();
	}

	List<String> companies(UUID organizationId) {
		return this.jdbc.sql(COMPANIES)
			.param("organizationId", organizationId)
			.param("limit", MAX_COMPANIES)
			.query(String.class)
			.list();
	}

}
