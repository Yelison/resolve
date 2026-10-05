package com.resolve.api.memberships;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import com.resolve.api.memberships.MemberDtos.TeamMetricsDto;
import com.resolve.api.organizations.Organization;
import com.resolve.api.organizations.OrganizationRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/** Carga y métricas del equipo de toda la organización, calculadas en el servidor. */
@Component
class TeamMetricsQuery {

	/** La misma ventana de primera respuesta que las métricas de tickets: tickets creados en las últimas 168 h. */
	private static final Duration FIRST_RESPONSE_WINDOW = Duration.ofHours(168);

	private static final String COUNTS = """
			SELECT
			  (SELECT count(*) FROM memberships
			    WHERE organization_id = :organizationId AND status = 'active' AND role IN ('admin', 'agent')) AS staff,
			  count(*) FILTER (WHERE status <> 'resolved' AND assignee_id IS NOT NULL) AS assigned_open,
			  count(*) FILTER (WHERE status <> 'resolved' AND assignee_id IS NULL) AS unassigned_open,
			  round((percentile_cont(0.5) WITHIN GROUP (
			      ORDER BY extract(epoch FROM first_response_at - created_at) / 60)
			    FILTER (WHERE created_at >= :window AND first_response_at IS NOT NULL))::numeric) AS first_response
			FROM tickets
			WHERE organization_id = :organizationId
			""";

	private final JdbcClient jdbc;

	private final OrganizationRepository organizations;

	private final Clock clock;

	TeamMetricsQuery(JdbcClient jdbc, OrganizationRepository organizations, Clock clock) {
		this.jdbc = jdbc;
		this.organizations = organizations;
		this.clock = clock;
	}

	/** Tickets sin resolver asignados a cada usuario; quien no aparece tiene cero. */
	Map<UUID, Integer> openTicketsByAssignee(UUID organizationId) {
		Map<UUID, Integer> load = new HashMap<>();
		this.jdbc.sql("""
				SELECT assignee_id, count(*) AS open_tickets FROM tickets
				WHERE organization_id = ? AND assignee_id IS NOT NULL AND status <> 'resolved'
				GROUP BY assignee_id
				""")
			.param(organizationId)
			.query((row, index) -> load.put(row.getObject("assignee_id", UUID.class), row.getInt("open_tickets")))
			.list();
		return load;
	}

	TeamMetricsDto compute(UUID organizationId) {
		Organization organization = this.organizations.findById(organizationId).orElseThrow();
		Timestamp window = Timestamp.from(this.clock.instant().minus(FIRST_RESPONSE_WINDOW));
		return this.jdbc.sql(COUNTS)
			.param("organizationId", organizationId)
			.param("window", window)
			.query((row, index) -> {
				int staff = row.getInt("staff");
				int assigned = row.getInt("assigned_open");
				Number firstResponse = (Number) row.getObject("first_response");
				return new TeamMetricsDto(staff, assigned, row.getInt("unassigned_open"), averageLoad(assigned, staff),
						(firstResponse != null) ? firstResponse.intValue() : null,
						organization.getFirstResponseTargetMinutes());
			})
			.single();
	}

	/** Tickets asignados por persona con un decimal; cero sin equipo. */
	private static double averageLoad(int assignedOpen, int staff) {
		if (staff == 0) {
			return 0;
		}
		return BigDecimal.valueOf(assignedOpen).divide(BigDecimal.valueOf(staff), 1, RoundingMode.HALF_UP).doubleValue();
	}

}
