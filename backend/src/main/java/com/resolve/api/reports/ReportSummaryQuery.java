package com.resolve.api.reports;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import com.resolve.api.common.persistence.WireEnum;
import com.resolve.api.memberships.MemberRefDto;
import com.resolve.api.memberships.MemberStatus;
import com.resolve.api.organizations.Organization;
import com.resolve.api.organizations.OrganizationRepository;
import com.resolve.api.reports.ReportDtos.Agent;
import com.resolve.api.reports.ReportDtos.Channel;
import com.resolve.api.reports.ReportDtos.Count;
import com.resolve.api.reports.ReportDtos.Day;
import com.resolve.api.reports.ReportDtos.FirstResponse;
import com.resolve.api.reports.ReportDtos.Range;
import com.resolve.api.reports.ReportDtos.ReportSummaryDto;
import com.resolve.api.reports.ReportDtos.Resolution;
import com.resolve.api.tickets.TicketChannel;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Informe de toda la organización en un periodo, calculado en la base de datos y en la zona horaria de la organización.
 *
 * <p>
 * Los límites del periodo son instantes calculados aquí con las reglas de la zona (así un día de 23 o 25 horas por un
 * cambio de horario no desplaza nada); la base solo usa la zona para decidir a qué día pertenece cada ticket
 * ({@code created_at AT TIME ZONE zona}). El periodo anterior es adyacente y dura lo mismo en tiempo transcurrido:
 * {@code [desde − (hasta − desde), desde)}.
 */
@Component
class ReportSummaryQuery {

	/**
	 * Un recorrido de los tickets de ambos periodos. El primer ticket resuelto de cada uno sale del historial; como
	 * una resolución es posterior a la creación, basta con mirar las posteriores al inicio del periodo anterior.
	 */
	private static final String TICKETS = """
			WITH first_resolved AS (
			  SELECT ticket_id, min(created_at) AS resolved_at
			  FROM ticket_activities
			  WHERE organization_id = :organizationId AND type = 'status_changed' AND to_value = 'resolved'
			    AND created_at >= :previousFrom
			  GROUP BY ticket_id
			)
			SELECT
			  count(*) FILTER (WHERE t.created_at >= :from) AS created,
			  count(*) FILTER (WHERE t.created_at < :from) AS created_previous,
			  round((percentile_cont(0.5) WITHIN GROUP (
			      ORDER BY extract(epoch FROM t.first_response_at - t.created_at) / 60)
			    FILTER (WHERE t.created_at >= :from AND t.first_response_at IS NOT NULL))::numeric) AS first_response,
			  round((percentile_cont(0.5) WITHIN GROUP (
			      ORDER BY extract(epoch FROM t.first_response_at - t.created_at) / 60)
			    FILTER (WHERE t.created_at < :from AND t.first_response_at IS NOT NULL))::numeric) AS first_response_previous,
			  round((percentile_cont(0.5) WITHIN GROUP (
			      ORDER BY extract(epoch FROM r.resolved_at - t.created_at) / 3600)
			    FILTER (WHERE t.created_at >= :from AND r.resolved_at IS NOT NULL))::numeric, 1) AS resolution,
			  round((percentile_cont(0.5) WITHIN GROUP (
			      ORDER BY extract(epoch FROM r.resolved_at - t.created_at) / 3600)
			    FILTER (WHERE t.created_at < :from AND r.resolved_at IS NOT NULL))::numeric, 1) AS resolution_previous
			FROM tickets t
			LEFT JOIN first_resolved r ON r.ticket_id = t.id
			WHERE t.organization_id = :organizationId AND t.created_at >= :previousFrom AND t.created_at <= :to
			""";

	/** Tickets distintos que entraron en {@code resolved}: un ticket reabierto y resuelto otra vez cuenta una vez. */
	private static final String RESOLVED = """
			SELECT
			  count(DISTINCT ticket_id) FILTER (WHERE created_at >= :from) AS resolved,
			  count(DISTINCT ticket_id) FILTER (WHERE created_at < :from) AS resolved_previous
			FROM ticket_activities
			WHERE organization_id = :organizationId AND type = 'status_changed' AND to_value = 'resolved'
			  AND created_at >= :previousFrom AND created_at <= :to
			""";

	/**
	 * La serie de días se construye con fechas ({@code date + entero}), no con instantes, para que la zona de la sesión de
	 * la base no intervenga; cada ticket se asigna al día local de su instante.
	 */
	private static final String BY_DAY = """
			SELECT d.day AS day, coalesce(c.created, 0) AS created, coalesce(r.resolved, 0) AS resolved
			FROM (SELECT CAST(:firstDay AS date) + n AS day FROM generate_series(0, :days - 1) AS n) d
			LEFT JOIN (
			  SELECT (created_at AT TIME ZONE CAST(:zone AS text))::date AS day, count(*) AS created
			  FROM tickets
			  WHERE organization_id = :organizationId AND created_at >= :from AND created_at <= :to
			  GROUP BY 1
			) c ON c.day = d.day
			LEFT JOIN (
			  SELECT (created_at AT TIME ZONE CAST(:zone AS text))::date AS day, count(DISTINCT ticket_id) AS resolved
			  FROM ticket_activities
			  WHERE organization_id = :organizationId AND type = 'status_changed' AND to_value = 'resolved'
			    AND created_at >= :from AND created_at <= :to
			  GROUP BY 1
			) r ON r.day = d.day
			ORDER BY d.day
			""";

	private static final String BY_CHANNEL = """
			SELECT channel, count(*) AS created
			FROM tickets
			WHERE organization_id = :organizationId AND created_at >= :from AND created_at <= :to
			GROUP BY channel
			ORDER BY count(*) DESC, channel
			""";

	/**
	 * Un miembro por fila, con el estado de su membresía. Aparecen todos los administradores y agentes activos y quien,
	 * sin serlo ya (retirado o invitado de nuevo), resolvió tickets o dio una primera respuesta en el periodo, para que
	 * su trabajo no desaparezca del informe. La primera
	 * respuesta es la de los tickets creados en el periodo cuyo primer mensaje público es del miembro; las notas internas
	 * no cuentan. Todo se acota a la organización, también las membresías: los usuarios se comparten entre organizaciones.
	 */
	private static final String BY_AGENT = """
			WITH resolved AS (
			  SELECT actor_user_id AS user_id, count(DISTINCT ticket_id) AS resolved
			  FROM ticket_activities
			  WHERE organization_id = :organizationId AND type = 'status_changed' AND to_value = 'resolved'
			    AND created_at >= :from AND created_at <= :to
			  GROUP BY actor_user_id
			), open_assigned AS (
			  SELECT assignee_id AS user_id, count(*) AS open_assigned
			  FROM tickets
			  WHERE organization_id = :organizationId AND assignee_id IS NOT NULL AND status <> 'resolved'
			  GROUP BY assignee_id
			), first_replies AS (
			  SELECT DISTINCT ON (m.ticket_id) m.author_user_id AS user_id,
			         extract(epoch FROM m.created_at - t.created_at) / 60 AS minutes
			  FROM ticket_messages m
			  JOIN tickets t ON t.id = m.ticket_id AND t.organization_id = m.organization_id
			  WHERE m.organization_id = :organizationId AND t.created_at >= :from AND t.created_at <= :to
			    AND m.visibility = 'public' AND m.author_kind = 'agent'
			  ORDER BY m.ticket_id, m.created_at, m.id
			), response AS (
			  SELECT user_id, round((percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes))::numeric) AS first_response
			  FROM first_replies
			  GROUP BY user_id
			)
			SELECT u.id AS id, u.name AS name, ms.status AS status, coalesce(r.resolved, 0) AS resolved, p.first_response AS first_response,
			       coalesce(o.open_assigned, 0) AS open_assigned
			FROM memberships ms
			JOIN users u ON u.id = ms.user_id
			LEFT JOIN resolved r ON r.user_id = u.id
			LEFT JOIN open_assigned o ON o.user_id = u.id
			LEFT JOIN response p ON p.user_id = u.id
			WHERE ms.organization_id = :organizationId AND ms.role IN ('admin', 'agent')
			  AND (ms.status = 'active' OR coalesce(r.resolved, 0) > 0 OR p.first_response IS NOT NULL)
			ORDER BY coalesce(r.resolved, 0) DESC, lower(u.name), u.id
			""";

	/** Décimas de punto porcentual que se reparten entre los canales: 100,0 %. */
	private static final int SHARE_UNITS = 1000;

	private final JdbcClient jdbc;

	private final OrganizationRepository organizations;

	private final Clock clock;

	ReportSummaryQuery(JdbcClient jdbc, OrganizationRepository organizations, Clock clock) {
		this.jdbc = jdbc;
		this.organizations = organizations;
		this.clock = clock;
	}

	ReportSummaryDto compute(UUID organizationId, ReportPeriod period) {
		Organization organization = this.organizations.findById(organizationId).orElseThrow();
		ZoneId zone = organization.zone();
		Instant to = this.clock.instant();
		LocalDate firstDay = LocalDate.ofInstant(to, zone).minusDays(period.days() - 1L);
		Instant from = firstDay.atStartOfDay(zone).toInstant();
		Instant previousFrom = from.minus(Duration.between(from, to));
		Window window = new Window(organizationId, zone, firstDay, period.days(), from, to, previousFrom);

		TicketFigures tickets = tickets(window);
		int[] resolved = resolved(window);
		return new ReportSummaryDto(new Range(from, to, period.days(), zone.getId()),
				new Count(tickets.created(), tickets.createdPrevious()), new Count(resolved[0], resolved[1]),
				new FirstResponse(tickets.firstResponse(), tickets.firstResponsePrevious(),
						organization.getFirstResponseTargetMinutes()),
				new Resolution(tickets.resolution(), tickets.resolutionPrevious()), days(window), channels(window),
				agents(window));
	}

	private TicketFigures tickets(Window window) {
		return window.bind(this.jdbc.sql(TICKETS)).query((row, index) -> new TicketFigures(row.getInt("created"),
				row.getInt("created_previous"), integer(row.getBigDecimal("first_response")),
				integer(row.getBigDecimal("first_response_previous")), row.getBigDecimal("resolution"),
				row.getBigDecimal("resolution_previous")))
			.single();
	}

	private int[] resolved(Window window) {
		return window.bind(this.jdbc.sql(RESOLVED))
			.query((row, index) -> new int[] { row.getInt("resolved"), row.getInt("resolved_previous") })
			.single();
	}

	private List<Day> days(Window window) {
		return window.bind(this.jdbc.sql(BY_DAY))
			.query((row, index) -> new Day(row.getObject("day", LocalDate.class), row.getInt("created"),
					row.getInt("resolved")))
			.list();
	}

	private List<Channel> channels(Window window) {
		List<ChannelCount> counts = window.bind(this.jdbc.sql(BY_CHANNEL))
			.query((row, index) -> new ChannelCount(
					WireEnum.fromWire(TicketChannel.class, row.getString("channel")).orElseThrow(),
					row.getInt("created")))
			.list();
		return withShares(counts);
	}

	private List<Agent> agents(Window window) {
		return window.bind(this.jdbc.sql(BY_AGENT))
			.query((row, index) -> new Agent(
					new MemberRefDto(row.getObject("id", UUID.class), row.getString("name")),
					WireEnum.fromWire(MemberStatus.class, row.getString("status")).orElseThrow(), row.getInt("resolved"),
					integer(row.getBigDecimal("first_response")), row.getInt("open_assigned")))
			.list();
	}

	/**
	 * Cada canal con su porcentaje en décimas, repartido por mayor resto: el redondeo individual puede sumar 99,9 o
	 * 100,1, y esta suma es siempre 100,0. En un empate de restos el décimo va al canal que va antes (más tickets y, a
	 * igualdad, nombre).
	 */
	static List<Channel> withShares(List<ChannelCount> counts) {
		int total = counts.stream().mapToInt(ChannelCount::created).sum();
		if (total == 0) {
			return List.of();
		}
		int[] units = new int[counts.size()];
		int assigned = 0;
		for (int i = 0; i < units.length; i++) {
			units[i] = (int) ((long) counts.get(i).created() * SHARE_UNITS / total);
			assigned += units[i];
		}
		List<Integer> byRemainder = new ArrayList<>();
		for (int i = 0; i < units.length; i++) {
			byRemainder.add(i);
		}
		byRemainder.sort(Comparator.comparingLong((Integer i) -> (long) counts.get(i).created() * SHARE_UNITS % total)
			.reversed()
			.thenComparing(Comparator.naturalOrder()));
		for (int k = 0; k < SHARE_UNITS - assigned; k++) {
			units[byRemainder.get(k)]++;
		}
		List<Channel> channels = new ArrayList<>();
		for (int i = 0; i < units.length; i++) {
			channels.add(new Channel(counts.get(i).channel(), counts.get(i).created(), BigDecimal.valueOf(units[i], 1)));
		}
		return channels;
	}

	private static @Nullable Integer integer(@Nullable BigDecimal value) {
		return (value != null) ? value.intValue() : null;
	}

	record ChannelCount(TicketChannel channel, int created) {
	}

	private record TicketFigures(int created, int createdPrevious, @Nullable Integer firstResponse,
			@Nullable Integer firstResponsePrevious, @Nullable BigDecimal resolution,
			@Nullable BigDecimal resolutionPrevious) {
	}

	/** Límites del informe, compartidos por todas las consultas. */
	private record Window(UUID organizationId, ZoneId zone, LocalDate firstDay, int days, Instant from, Instant to,
			Instant previousFrom) {

		JdbcClient.StatementSpec bind(JdbcClient.StatementSpec statement) {
			return statement.param("organizationId", this.organizationId)
				.param("zone", this.zone.getId())
				.param("firstDay", this.firstDay)
				.param("days", this.days)
				.param("from", Timestamp.from(this.from))
				.param("to", Timestamp.from(this.to))
				.param("previousFrom", Timestamp.from(this.previousFrom));
		}

	}

}
