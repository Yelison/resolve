package com.resolve.api.tickets;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.organizations.Organization;
import com.resolve.api.organizations.OrganizationRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Métricas de toda la organización, independientes de los filtros de la bandeja. «Hoy» y «ayer» se calculan en la
 * zona horaria de la organización.
 */
@Component
class TicketMetricsQuery {

	static final Duration FIRST_RESPONSE_WINDOW = Duration.ofHours(168);

	private static final String COUNTS = """
			SELECT
			  count(*) FILTER (WHERE status = 'open') AS open,
			  count(*) FILTER (WHERE status = 'open' AND created_at >= :today) AS opened_today,
			  count(*) FILTER (WHERE status = 'in_progress') AS in_progress,
			  count(*) FILTER (WHERE status = 'in_progress' AND assignee_id = :viewer) AS in_progress_mine,
			  count(*) AS view_all,
			  count(*) FILTER (WHERE assignee_id = :viewer AND status <> 'resolved') AS view_mine,
			  count(*) FILTER (WHERE assignee_id IS NULL AND status <> 'resolved') AS view_unassigned,
			  count(*) FILTER (WHERE status = 'resolved') AS view_resolved,
			  round((percentile_cont(0.5) WITHIN GROUP (
			      ORDER BY extract(epoch FROM first_response_at - created_at) / 60)
			    FILTER (WHERE created_at >= :window AND first_response_at IS NOT NULL))::numeric) AS first_response
			FROM tickets
			WHERE organization_id = :organizationId
			""";

	private static final String RESOLVED = """
			SELECT
			  count(DISTINCT ticket_id) FILTER (WHERE created_at >= :today) AS resolved_today,
			  count(DISTINCT ticket_id) FILTER (WHERE created_at >= :yesterday AND created_at < :today) AS resolved_yesterday
			FROM ticket_activities
			WHERE organization_id = :organizationId AND type = 'status_changed' AND to_value = 'resolved'
			  AND created_at >= :yesterday
			""";

	private final JdbcClient jdbc;

	private final OrganizationRepository organizations;

	private final Clock clock;

	TicketMetricsQuery(JdbcClient jdbc, OrganizationRepository organizations, Clock clock) {
		this.jdbc = jdbc;
		this.organizations = organizations;
		this.clock = clock;
	}

	TicketMetrics compute(CurrentMember member) {
		Organization organization = this.organizations.findById(member.organizationId()).orElseThrow();
		ZoneId zone = organization.zone();
		Instant now = this.clock.instant();
		LocalDate today = LocalDate.ofInstant(now, zone);
		Timestamp startOfToday = Timestamp.from(today.atStartOfDay(zone).toInstant());
		Timestamp startOfYesterday = Timestamp.from(today.minusDays(1).atStartOfDay(zone).toInstant());

		int[] resolved = this.jdbc.sql(RESOLVED)
			.param("organizationId", member.organizationId())
			.param("today", startOfToday)
			.param("yesterday", startOfYesterday)
			.query((row, index) -> new int[] { row.getInt("resolved_today"), row.getInt("resolved_yesterday") })
			.single();

		return this.jdbc.sql(COUNTS)
			.param("organizationId", member.organizationId())
			.param("viewer", member.userId())
			.param("today", startOfToday)
			.param("window", Timestamp.from(now.minus(FIRST_RESPONSE_WINDOW)))
			.query((row, index) -> {
				Number firstResponse = (Number) row.getObject("first_response");
				return new TicketMetrics(row.getInt("open"), row.getInt("opened_today"), row.getInt("in_progress"),
						row.getInt("in_progress_mine"), resolved[0], resolved[1],
						(firstResponse != null) ? firstResponse.intValue() : null,
						organization.getFirstResponseTargetMinutes(),
						new TicketMetrics.ViewCounts(row.getInt("view_all"), row.getInt("view_mine"),
								row.getInt("view_unassigned"), row.getInt("view_resolved")));
			})
			.single();
	}

}
