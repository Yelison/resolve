package com.resolve.api.reports;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Los datos de los gráficos de Reportes: tickets sin resolver ahora (por estado y prioridad), tiempos de resolución por
 * tramos y tickets creados por día de la semana y hora local. Acme está en America/Bogota (UTC−5, sin horario de
 * verano) y el reloj empieza el 4 de octubre de 2026 a las 15:00 UTC: el periodo de 7 días va de las 05:00 UTC del 28 de
 * septiembre (un lunes) a ese instante.
 */
class ReportsBreakdownsApiTest extends ReportsFixture {

	private static final List<String> BUCKETS = List.of("under1h", "from1To4h", "from4To8h", "from8To24h", "from1To3d",
			"over3d");

	@Autowired
	private JdbcClient jdbc;

	/** Para los tickets que se insertan con un estado distinto de {@code open}; no chocan con la numeración de la fixture. */
	private long number = 5000;

	// --- Tickets sin resolver ahora ---

	@Test
	void openTicketsAreCountedByTheirCurrentStatusAndPriorityWhateverThePeriod() throws Exception {
		openTicket(this.acme, this.customer, "open", "urgent", "2026-01-10T12:00:00Z"); // muy anterior al periodo
		openTicket(this.acme, this.customer, "open", "high", "2026-10-02T12:00:00Z");
		openTicket(this.acme, this.customer, "in_progress", "medium", "2026-09-01T12:00:00Z");
		openTicket(this.acme, this.customer, "in_progress", "medium", "2026-10-03T12:00:00Z");
		openTicket(this.acme, this.customer, "in_progress", "low", "2026-10-03T12:00:00Z");
		openTicket(this.acme, this.customer, "waiting", "urgent", "2026-10-03T12:00:00Z");
		// Resuelto: no cuenta, ni siquiera creado en el periodo.
		openTicket(this.acme, this.customer, "resolved", "urgent", "2026-10-03T12:00:00Z");
		// Reabierto: cuenta con su estado actual.
		UUID reopened = openTicket(this.acme, this.customer, "open", "low", "2026-10-03T12:00:00Z");
		this.data.changeStatus(this.acme, reopened, this.laura, "Laura Méndez", "resolved", at("2026-10-03T13:00:00Z"));
		this.data.changeStatus(this.acme, reopened, this.laura, "Laura Méndez", "waiting", at("2026-10-03T14:00:00Z"));
		// Con la prioridad cambiada cuenta una vez, con la última.
		UUID escalated = openTicket(this.acme, this.customer, "open", "low", "2026-10-03T12:00:00Z");
		this.jdbc.sql("UPDATE tickets SET priority = 'high' WHERE id = ?").params(escalated).update();

		for (String period : List.of("7d", "30d", "90d")) {
			JsonNode summary = summary(LAURA, period);

			assertThat(summary.path("openByStatus").propertyNames()).containsExactly("open", "inProgress", "waiting");
			assertThat(summary.at("/openByStatus/open").asInt()).isEqualTo(3);
			assertThat(summary.at("/openByStatus/inProgress").asInt()).isEqualTo(3);
			assertThat(summary.at("/openByStatus/waiting").asInt()).isEqualTo(2);
			assertThat(summary.path("openByPriority").propertyNames()).containsExactly("urgent", "high", "medium", "low");
			assertThat(summary.at("/openByPriority/urgent").asInt()).isEqualTo(2);
			assertThat(summary.at("/openByPriority/high").asInt()).isEqualTo(2);
			assertThat(summary.at("/openByPriority/medium").asInt()).isEqualTo(2);
			assertThat(summary.at("/openByPriority/low").asInt()).isEqualTo(2);
		}
	}

	// --- Tiempos de resolución ---

	/** Los seis tramos son {@code [mín, máx)}: el instante exacto del límite pertenece al tramo de arriba. */
	@Test
	void resolutionBucketsHonourTheirExactBounds() throws Exception {
		String created = "2026-09-29T00:00:00Z";
		resolvedAfter(created, Duration.ofMinutes(59));
		resolvedAfter(created, Duration.ofSeconds(3599));
		resolvedAfter(created, Duration.ofHours(1));
		resolvedAfter(created, Duration.ofHours(4).minusSeconds(1));
		resolvedAfter(created, Duration.ofHours(4));
		resolvedAfter(created, Duration.ofHours(8).minusSeconds(1));
		resolvedAfter(created, Duration.ofHours(8));
		resolvedAfter(created, Duration.ofHours(24).minusSeconds(1));
		resolvedAfter(created, Duration.ofHours(24));
		resolvedAfter(created, Duration.ofDays(3).minusSeconds(1));
		resolvedAfter(created, Duration.ofDays(3));
		resolvedAfter(created, Duration.ofHours(100));

		JsonNode summary = summary(LAURA, "7d");

		assertThat(buckets(summary)).containsExactly("under1h=2", "from1To4h=2", "from4To8h=2", "from8To24h=2",
				"from1To3d=2", "over3d=2");
		assertThat(bucketSum(summary)).isEqualTo(12).isEqualTo(summary.at("/resolved/value").asInt());
	}

	@Test
	void aReopenedTicketIsPlacedByItsFirstResolution() throws Exception {
		UUID ticket = ticket("email", "2026-10-01T00:00:00Z");
		this.data.changeStatus(this.acme, ticket, this.laura, "Laura Méndez", "resolved", at("2026-10-01T00:30:00Z"));
		this.data.changeStatus(this.acme, ticket, this.laura, "Laura Méndez", "open", at("2026-10-01T01:30:00Z"));
		this.data.changeStatus(this.acme, ticket, this.laura, "Laura Méndez", "resolved", at("2026-10-03T02:00:00Z"));

		JsonNode summary = summary(LAURA, "7d");

		assertThat(buckets(summary)).containsExactly("under1h=1", "from1To4h=0", "from4To8h=0", "from8To24h=0",
				"from1To3d=0", "over3d=0");
		assertThat(bucketSum(summary)).isEqualTo(summary.at("/resolved/value").asInt()).isEqualTo(1);
		// La misma duración que la mediana de resolutionHours (0,5 h).
		assertThat(summary.at("/resolutionHours/value").asDouble()).isEqualTo(0.5);
	}

	/**
	 * La población es la de {@code resolved.value}: tickets que entraron en {@code resolved} dentro del periodo, se
	 * crearan cuando se crearan. {@code resolutionHours}, en cambio, mide los creados en el periodo.
	 */
	@Test
	void resolutionBucketsCoverEveryTicketResolvedInThePeriodWheneverItWasCreated() throws Exception {
		// Creado y resuelto por primera vez en el periodo anterior (1 h), reabierto y resuelto otra vez en este.
		UUID previous = ticket("email", "2026-09-25T00:00:00Z");
		this.data.changeStatus(this.acme, previous, this.laura, "Laura Méndez", "resolved", at("2026-09-25T01:00:00Z"));
		this.data.changeStatus(this.acme, previous, this.laura, "Laura Méndez", "open", at("2026-09-26T00:00:00Z"));
		this.data.changeStatus(this.acme, previous, this.laura, "Laura Méndez", "resolved", at("2026-10-02T00:00:00Z"));
		// Creado mucho antes del periodo y resuelto por primera vez dentro de él: más de 3 días.
		UUID old = ticket("email", "2026-08-01T00:00:00Z");
		this.data.changeStatus(this.acme, old, this.laura, "Laura Méndez", "resolved", at("2026-10-02T00:00:00Z"));
		// Su primera resolución es anterior incluso al periodo anterior (empieza el 21 de septiembre): la búsqueda de la
		// primera resolución no tiene cota inferior, así que sigue siendo 2 h y no la resolución de este periodo.
		UUID ancient = ticket("email", "2026-09-01T00:00:00Z");
		this.data.changeStatus(this.acme, ancient, this.laura, "Laura Méndez", "resolved", at("2026-09-01T02:00:00Z"));
		this.data.changeStatus(this.acme, ancient, this.laura, "Laura Méndez", "open", at("2026-09-02T00:00:00Z"));
		this.data.changeStatus(this.acme, ancient, this.laura, "Laura Méndez", "resolved", at("2026-10-03T00:00:00Z"));
		// Resuelto solo antes del periodo: no cuenta.
		UUID before = ticket("email", "2026-09-24T00:00:00Z");
		this.data.changeStatus(this.acme, before, this.laura, "Laura Méndez", "resolved", at("2026-09-24T02:00:00Z"));

		JsonNode summary = summary(LAURA, "7d");

		assertThat(buckets(summary)).containsExactly("under1h=0", "from1To4h=2", "from4To8h=0", "from8To24h=0",
				"from1To3d=0", "over3d=1");
		assertThat(summary.at("/resolved/value").asInt()).isEqualTo(3);
		assertThat(bucketSum(summary)).isEqualTo(3);
		assertThat(summary.at("/resolutionHours/value").isNull()).isTrue();
	}

	@Test
	void resolutionBucketsIgnoreResolutionsAfterThePeriodEnds() throws Exception {
		// Creado en el periodo, pero su resolución es posterior a «ahora»: aún no existe para este informe.
		UUID ticket = ticket("email", "2026-10-04T14:00:00Z");
		this.data.changeStatus(this.acme, ticket, this.laura, "Laura Méndez", "resolved", at("2026-10-04T15:00:01Z"));
		resolvedAfter("2026-10-04T14:00:00Z", Duration.ofMinutes(59));

		JsonNode summary = summary(LAURA, "7d");

		assertThat(summary.at("/resolved/value").asInt()).isEqualTo(1);
		assertThat(buckets(summary)).containsExactly("under1h=1", "from1To4h=0", "from4To8h=0", "from8To24h=0",
				"from1To3d=0", "over3d=0");
	}

	// --- Tickets creados por día de la semana y hora ---

	@Test
	void createdByWeekdayHourUsesTheIsoWeekdayAndTheOrganizationsLocalHour() throws Exception {
		// Lunes 28 de septiembre, 09:00 y 09:59:59 en Bogotá (14:00Z y 14:59:59Z): una sola celda.
		ticket("email", "2026-09-28T09:00:00-05:00");
		ticket("chat", "2026-09-28T09:59:59-05:00");
		// Viernes 2 de octubre a las 22:00 locales: ya es sábado en UTC.
		ticket("email", "2026-10-02T22:00:00-05:00");
		// Un segundo antes de medianoche y medianoche exacta: viernes 23 y sábado 0.
		ticket("email", "2026-10-02T23:59:59-05:00");
		ticket("email", "2026-10-03T00:00:00-05:00");
		// Domingo: ISO 7, no 0.
		ticket("web", "2026-10-04T08:00:00-05:00");
		// Un segundo antes del periodo (domingo 27 a las 23:59:59 locales): el periodo anterior, fuera del mapa.
		ticket("web", "2026-09-27T23:59:59-05:00");

		JsonNode summary = summary(LAURA, "7d");

		assertThat(cells(summary)).containsExactly("1/9=2", "5/22=1", "5/23=1", "6/0=1", "7/8=1");
		assertThat(cellSum(summary)).isEqualTo(6).isEqualTo(summary.at("/created/value").asInt());
		assertThat(summary.at("/created/previous").asInt()).isEqualTo(1);
	}

	/** Madrid retrocede una hora el domingo 25 de octubre de 2026 a las 03:00: las dos 02:30 son la misma celda. */
	@Test
	void createdByWeekdayHourAddsTheRepeatedHourOfTheOctoberChange() throws Exception {
		Seeded madrid = organizationIn("Madrid", "Europe/Madrid");
		this.clock.set(at("2026-10-26T13:00:00+01:00"));
		madrid.ticket(this, "email", "2026-10-24T23:30:00+02:00"); // sábado 23
		madrid.ticket(this, "email", "2026-10-25T00:30:00+02:00"); // domingo 0
		madrid.ticket(this, "email", "2026-10-25T02:30:00+02:00"); // domingo 2…
		madrid.ticket(this, "email", "2026-10-25T02:30:00+01:00"); // …otra vez
		madrid.ticket(this, "email", "2026-10-25T23:30:00+01:00"); // domingo 23
		madrid.ticket(this, "email", "2026-10-26T00:10:00+01:00"); // lunes 0

		JsonNode summary = summary(madrid.email(), "7d");

		assertThat(cells(summary)).containsExactly("1/0=1", "6/23=1", "7/0=1", "7/2=2", "7/23=1");
		assertThat(cellSum(summary)).isEqualTo(6).isEqualTo(summary.at("/created/value").asInt());
	}

	/** Madrid adelanta una hora el domingo 29 de marzo de 2026 a las 02:00: no existe ninguna celda de las 02:00. */
	@Test
	void createdByWeekdayHourHasNoCellForTheHourThatDoesNotExist() throws Exception {
		Seeded madrid = organizationIn("Madrid", "Europe/Madrid");
		this.clock.set(at("2026-03-30T13:00:00+02:00"));
		madrid.ticket(this, "email", "2026-03-29T01:59:59+01:00"); // domingo 1
		madrid.ticket(this, "email", "2026-03-29T03:00:00+02:00"); // domingo 3: la hora siguiente
		madrid.ticket(this, "email", "2026-03-29T03:59:59+02:00");

		JsonNode summary = summary(madrid.email(), "7d");

		assertThat(cells(summary)).containsExactly("7/1=1", "7/3=2");
		assertThat(cellSum(summary)).isEqualTo(3).isEqualTo(summary.at("/created/value").asInt());
	}

	// --- Sin datos y aislamiento ---

	@Test
	void anEmptyOrganizationHasZeroCountsSixEmptyBucketsAndAnEmptyMap() throws Exception {
		JsonNode summary = summary(LAURA, "7d");

		assertThat(summary.at("/openByStatus/open").asInt()).isZero();
		assertThat(summary.at("/openByStatus/inProgress").asInt()).isZero();
		assertThat(summary.at("/openByStatus/waiting").asInt()).isZero();
		assertThat(summary.at("/openByPriority/urgent").asInt()).isZero();
		assertThat(summary.at("/openByPriority/high").asInt()).isZero();
		assertThat(summary.at("/openByPriority/medium").asInt()).isZero();
		assertThat(summary.at("/openByPriority/low").asInt()).isZero();
		assertThat(buckets(summary)).containsExactly("under1h=0", "from1To4h=0", "from4To8h=0", "from8To24h=0",
				"from1To3d=0", "over3d=0");
		assertThat(summary.path("createdByWeekdayHour")).isEmpty();
	}

	@Test
	void anotherOrganizationsTicketsNeverReachTheseFigures() throws Exception {
		openTicket(this.acme, this.customer, "open", "high", "2026-10-02T12:00:00Z");
		ticket("email", "2026-10-02T12:00:00Z");
		// Northwind (Europe/Madrid): abiertos, resueltos en el periodo y creados en el periodo.
		openTicket(this.northwind, this.northwindCustomer, "waiting", "urgent", "2026-10-02T12:00:00Z");
		openTicket(this.northwind, this.northwindCustomer, "in_progress", "urgent", "2026-10-02T12:00:00Z");
		UUID foreign = openTicket(this.northwind, this.northwindCustomer, "open", "low", "2026-10-02T12:00:00Z");
		this.data.changeStatus(this.northwind, foreign, this.northwindAgent, "Jordi Puig", "resolved",
				at("2026-10-02T12:10:00Z"));

		JsonNode acmeReport = summary(LAURA, "7d");
		JsonNode northwindReport = summary(NORTHWIND_AGENT, "7d");

		assertThat(acmeReport.at("/openByStatus/open").asInt()).isEqualTo(2);
		assertThat(acmeReport.at("/openByStatus/inProgress").asInt()).isZero();
		assertThat(acmeReport.at("/openByStatus/waiting").asInt()).isZero();
		assertThat(acmeReport.at("/openByPriority/urgent").asInt()).isZero();
		assertThat(acmeReport.at("/openByPriority/high").asInt()).isEqualTo(1);
		assertThat(buckets(acmeReport)).containsExactly("under1h=0", "from1To4h=0", "from4To8h=0", "from8To24h=0",
				"from1To3d=0", "over3d=0");
		assertThat(cells(acmeReport)).containsExactly("5/7=2"); // 12:00Z son las 07:00 de Bogotá

		assertThat(northwindReport.at("/openByStatus/inProgress").asInt()).isEqualTo(1);
		assertThat(northwindReport.at("/openByStatus/waiting").asInt()).isEqualTo(1);
		assertThat(northwindReport.at("/openByStatus/open").asInt()).isZero();
		assertThat(northwindReport.at("/openByPriority/urgent").asInt()).isEqualTo(2);
		assertThat(buckets(northwindReport)).containsExactly("under1h=1", "from1To4h=0", "from4To8h=0",
				"from8To24h=0", "from1To3d=0", "over3d=0");
		assertThat(cells(northwindReport)).containsExactly("5/14=3"); // 12:00Z son las 14:00 de Madrid
	}

	// --- Utilidades ---

	/** Ticket con estado y prioridad explícitos, insertado directamente. */
	private UUID openTicket(UUID organization, UUID customerId, String status, String priority, String createdAt) {
		UUID id = this.data.ticket(organization, customerId, ++this.number, status, "email", at(createdAt));
		this.jdbc.sql("UPDATE tickets SET priority = ? WHERE id = ?").params(priority, id).update();
		return id;
	}

	/** Ticket de Acme creado en ese instante y resuelto tras la duración indicada. */
	private UUID resolvedAfter(String createdAt, Duration after) {
		UUID ticket = ticket("email", createdAt);
		this.data.changeStatus(this.acme, ticket, this.laura, "Laura Méndez", "resolved", at(createdAt).plus(after));
		return ticket;
	}

	/** {@code tramo=recuento} en el orden de la respuesta; comprueba además que están los seis y en su orden. */
	private static List<String> buckets(JsonNode summary) {
		List<String> buckets = new ArrayList<>();
		summary.path("resolutionTimes").forEach((time) -> buckets.add(time.path("bucket").asString() + "="
				+ time.path("resolved").asInt()));
		assertThat(buckets.stream().map((bucket) -> bucket.substring(0, bucket.indexOf('='))).toList())
			.containsExactlyElementsOf(BUCKETS);
		return buckets;
	}

	private static int bucketSum(JsonNode summary) {
		return summary.path("resolutionTimes").valueStream().mapToInt((time) -> time.path("resolved").asInt()).sum();
	}

	/** {@code díaISO/hora=recuento}; todas las celdas tienen al menos un ticket. */
	private static List<String> cells(JsonNode summary) {
		List<String> cells = new ArrayList<>();
		summary.path("createdByWeekdayHour").forEach((cell) -> {
			assertThat(cell.path("created").asInt()).isPositive();
			cells.add(cell.path("weekday").asInt() + "/" + cell.path("hour").asInt() + "=" + cell.path("created").asInt());
		});
		return cells;
	}

	private static int cellSum(JsonNode summary) {
		return summary.path("createdByWeekdayHour").valueStream().mapToInt((cell) -> cell.path("created").asInt()).sum();
	}

}
