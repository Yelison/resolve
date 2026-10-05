package com.resolve.api.reports;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.mockito.Mockito;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Acme está en America/Bogota (UTC−5, sin horario de verano): el día local empieza a las 05:00 UTC. */
class ReportsApiTest extends ReportsFixture {

	@MockitoSpyBean
	private JdbcClient jdbc;

	// --- Días en la zona de la organización (foco de revisión 4) ---

	@Test
	void summaryCountsCreatedAndResolvedPerDayInTheOrganizationZone() throws Exception {
		Seeded mexico = organizationIn("Azteca", "America/Mexico_City"); // UTC−6 todo 2026
		this.clock.set(at("2026-10-04T12:00:00-06:00"));

		// 23:30 del 3 de octubre en la Ciudad de México: ya es el 4 en UTC, pero cuenta el día 3.
		UUID lateNight = mexico.ticket(this, "email", "2026-10-03T23:30:00-06:00");
		mexico.resolve(this, lateNight, "2026-10-03T23:45:00-06:00");
		mexico.ticket(this, "chat", "2026-10-04T00:10:00-06:00");
		// Fronteras exactas de un día: medianoche local abre el día; un segundo antes pertenece al anterior.
		mexico.ticket(this, "chat", "2026-10-02T00:00:00-06:00");
		mexico.ticket(this, "web", "2026-10-01T23:59:59-06:00");
		// Un segundo antes de empezar el periodo: queda fuera y entra en el periodo anterior.
		mexico.ticket(this, "web", "2026-09-27T23:59:59-06:00");

		JsonNode summary = summary(mexico.email(), "7d");

		assertThat(summary.at("/period/timeZone").asString()).isEqualTo("America/Mexico_City");
		assertThat(summary.at("/period/from").asString()).isEqualTo("2026-09-28T06:00:00Z");
		assertThat(summary.at("/period/to").asString()).isEqualTo("2026-10-04T18:00:00Z");
		assertThat(summary.at("/period/days").asInt()).isEqualTo(7);
		assertThat(dates(summary)).containsExactly("2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01",
				"2026-10-02", "2026-10-03", "2026-10-04");
		assertThat(day(summary, "2026-10-01").path("created").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-10-02").path("created").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-10-03").path("created").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-10-03").path("resolved").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-10-04").path("created").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-10-04").path("resolved").asInt()).isZero();
		assertThat(summary.at("/created/value").asInt()).isEqualTo(4);
		assertThat(summary.at("/created/previous").asInt()).isEqualTo(1);
		assertThat(summary.at("/resolved/value").asInt()).isEqualTo(1);
	}

	/** Madrid retrocede una hora el 25 de octubre de 2026 a las 03:00 (+02:00 → +01:00): ese día dura 25 horas. */
	@Test
	void summaryCountsDaysAcrossTheOctoberDaylightSavingChange() throws Exception {
		Seeded madrid = organizationIn("Madrid", "Europe/Madrid");
		this.clock.set(at("2026-10-26T13:00:00+01:00"));

		madrid.ticket(this, "email", "2026-10-24T23:30:00+02:00"); // día 24
		madrid.ticket(this, "email", "2026-10-25T00:30:00+02:00"); // primera hora del día 25
		madrid.ticket(this, "email", "2026-10-25T02:30:00+02:00"); // 02:30 ocurre dos veces…
		madrid.ticket(this, "email", "2026-10-25T02:30:00+01:00"); // …y las dos son del día 25
		UUID lastOfTheDay = madrid.ticket(this, "email", "2026-10-25T23:30:00+01:00"); // última hora del día 25
		madrid.resolve(this, lastOfTheDay, "2026-10-25T23:45:00+01:00");
		UUID firstOfTheNext = madrid.ticket(this, "email", "2026-10-26T00:10:00+01:00"); // día 26
		madrid.resolve(this, firstOfTheNext, "2026-10-26T00:20:00+01:00");

		JsonNode summary = summary(madrid.email(), "7d");

		// El periodo empieza a medianoche local del 20 (+02:00), antes del cambio de hora.
		assertThat(summary.at("/period/from").asString()).isEqualTo("2026-10-19T22:00:00Z");
		assertThat(dates(summary)).containsExactly("2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23",
				"2026-10-24", "2026-10-25", "2026-10-26");
		assertThat(day(summary, "2026-10-24").path("created").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-10-25").path("created").asInt()).isEqualTo(4);
		assertThat(day(summary, "2026-10-25").path("resolved").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-10-26").path("created").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-10-26").path("resolved").asInt()).isEqualTo(1);
		assertThat(summary.at("/created/value").asInt()).isEqualTo(6);
	}

	/** Sídney retrocede una hora el 5 de abril de 2026 a las 03:00 (+11:00 → +10:00): ese día dura 25 horas. */
	@Test
	void summaryCountsDaysAcrossTheAprilDaylightSavingChange() throws Exception {
		Seeded sydney = organizationIn("Sidney", "Australia/Sydney");
		this.clock.set(at("2026-04-06T12:00:00+10:00"));

		sydney.ticket(this, "chat", "2026-04-04T23:30:00+11:00"); // día 4
		sydney.ticket(this, "chat", "2026-04-05T00:30:00+11:00"); // primera hora del día 5
		sydney.ticket(this, "chat", "2026-04-05T02:30:00+11:00"); // 02:30 ocurre dos veces…
		sydney.ticket(this, "chat", "2026-04-05T02:30:00+10:00"); // …y las dos son del día 5
		UUID lastOfTheDay = sydney.ticket(this, "chat", "2026-04-05T23:30:00+10:00");
		sydney.resolve(this, lastOfTheDay, "2026-04-05T23:45:00+10:00");
		UUID firstOfTheNext = sydney.ticket(this, "chat", "2026-04-06T00:10:00+10:00"); // día 6
		sydney.resolve(this, firstOfTheNext, "2026-04-06T00:20:00+10:00");

		JsonNode summary = summary(sydney.email(), "7d");

		assertThat(summary.at("/period/from").asString()).isEqualTo("2026-03-30T13:00:00Z"); // 00:00+11:00 del 31
		assertThat(dates(summary)).containsExactly("2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03",
				"2026-04-04", "2026-04-05", "2026-04-06");
		assertThat(day(summary, "2026-04-04").path("created").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-04-05").path("created").asInt()).isEqualTo(4);
		assertThat(day(summary, "2026-04-05").path("resolved").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-04-06").path("created").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-04-06").path("resolved").asInt()).isEqualTo(1);
		assertThat(summary.at("/created/value").asInt()).isEqualTo(6);
	}

	/** Madrid adelanta una hora el 29 de marzo de 2026 a las 02:00 (+01:00 → +02:00): ese día dura 23 horas. */
	@Test
	void summaryCountsDaysAcrossTheMarchDaylightSavingChange() throws Exception {
		Seeded madrid = organizationIn("Madrid", "Europe/Madrid");
		this.clock.set(at("2026-03-30T13:00:00+02:00"));

		madrid.ticket(this, "email", "2026-03-28T23:30:00+01:00"); // día 28
		madrid.ticket(this, "email", "2026-03-29T00:30:00+01:00"); // primera hora del día 29
		madrid.ticket(this, "email", "2026-03-29T01:59:59+01:00"); // último segundo antes del salto
		madrid.ticket(this, "email", "2026-03-29T03:00:00+02:00"); // la hora siguiente: ya +02:00
		UUID lastOfTheDay = madrid.ticket(this, "email", "2026-03-29T23:30:00+02:00");
		madrid.resolve(this, lastOfTheDay, "2026-03-29T23:45:00+02:00");
		madrid.ticket(this, "email", "2026-03-30T00:10:00+02:00"); // día 30

		JsonNode summary = summary(madrid.email(), "7d");

		assertThat(summary.at("/period/from").asString()).isEqualTo("2026-03-23T23:00:00Z"); // 00:00+01:00 del 24
		assertThat(dates(summary)).containsExactly("2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27",
				"2026-03-28", "2026-03-29", "2026-03-30");
		assertThat(day(summary, "2026-03-28").path("created").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-03-29").path("created").asInt()).isEqualTo(4);
		assertThat(day(summary, "2026-03-29").path("resolved").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-03-30").path("created").asInt()).isEqualTo(1);
		assertThat(summary.at("/created/value").asInt()).isEqualTo(6);
	}

	/** El periodo empieza en un día de cambio de hora: Nueva York adelanta el 8 de marzo de 2026 (día de 23 horas). */
	@Test
	void aPeriodThatStartsOnADaylightSavingDayBeginsAtLocalMidnight() throws Exception {
		Seeded newYork = organizationIn("Nuevayork", "America/New_York");
		this.clock.set(at("2026-03-14T12:00:00-04:00"));
		// from = 2026-03-08T00:00-05:00 = 05:00Z; to = 2026-03-14T16:00Z (155 h) → previous = [2026-03-01T18:00Z, from)
		newYork.ticket(this, "web", "2026-03-08T00:00:00-05:00"); // en el inicio: periodo actual, día 8
		newYork.ticket(this, "web", "2026-03-08T03:30:00-04:00"); // tras el salto, también día 8
		newYork.ticket(this, "web", "2026-03-07T23:59:59-05:00"); // un segundo antes: periodo anterior
		newYork.ticket(this, "web", "2026-03-01T18:00:00Z"); // inicio del anterior: cuenta
		newYork.ticket(this, "web", "2026-03-01T17:59:59Z"); // un segundo antes: no cuenta

		JsonNode summary = summary(newYork.email(), "7d");

		assertThat(summary.at("/period/from").asString()).isEqualTo("2026-03-08T05:00:00Z");
		assertThat(dates(summary)).containsExactly("2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11",
				"2026-03-12", "2026-03-13", "2026-03-14");
		assertThat(day(summary, "2026-03-08").path("created").asInt()).isEqualTo(2);
		assertThat(summary.at("/created/value").asInt()).isEqualTo(2);
		assertThat(summary.at("/created/previous").asInt()).isEqualTo(2);
	}

	/** Santiago adelanta a medianoche el 6 de septiembre de 2026 (00:00−04:00 → 01:00−03:00): ese día no tiene las 00:00. */
	@Test
	void aSkippedMidnightStartsTheDayAtTheFirstExistingInstant() throws Exception {
		Seeded santiago = organizationIn("Santiago", "America/Santiago");
		this.clock.set(at("2026-09-12T12:00:00-03:00"));

		santiago.ticket(this, "chat", "2026-09-05T23:59:59-04:00"); // día 5: periodo anterior
		santiago.ticket(this, "chat", "2026-09-06T01:00:00-03:00"); // primer instante del día 6
		santiago.ticket(this, "chat", "2026-09-06T12:00:00-03:00");

		JsonNode summary = summary(santiago.email(), "7d");

		assertThat(summary.at("/period/from").asString()).isEqualTo("2026-09-06T04:00:00Z"); // 01:00−03:00
		assertThat(dates(summary)).containsExactly("2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09",
				"2026-09-10", "2026-09-11", "2026-09-12");
		assertThat(day(summary, "2026-09-06").path("created").asInt()).isEqualTo(2);
		assertThat(summary.at("/created/value").asInt()).isEqualTo(2);
		assertThat(summary.at("/created/previous").asInt()).isEqualTo(1);
	}

	/** Nueva York retrocede una hora el 1 de noviembre de 2026 a las 02:00 (−04:00 → −05:00): día de 25 horas. */
	@Test
	void summaryCountsDaysAcrossTheNovemberDaylightSavingChangeInNewYork() throws Exception {
		Seeded newYork = organizationIn("Nuevayork", "America/New_York");
		this.clock.set(at("2026-11-02T12:00:00-05:00"));

		newYork.ticket(this, "web", "2026-10-31T23:30:00-04:00"); // día 31
		newYork.ticket(this, "web", "2026-11-01T00:30:00-04:00"); // primera hora del día 1
		newYork.ticket(this, "web", "2026-11-01T01:30:00-04:00"); // 01:30 ocurre dos veces…
		newYork.ticket(this, "web", "2026-11-01T01:30:00-05:00"); // …y las dos son del día 1
		newYork.ticket(this, "web", "2026-11-01T23:30:00-05:00"); // última hora del día 1
		newYork.ticket(this, "web", "2026-11-02T00:10:00-05:00"); // día 2

		JsonNode summary = summary(newYork.email(), "7d");

		assertThat(summary.at("/period/from").asString()).isEqualTo("2026-10-27T04:00:00Z"); // 00:00−04:00 del 27
		assertThat(dates(summary)).containsExactly("2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30",
				"2026-10-31", "2026-11-01", "2026-11-02");
		assertThat(day(summary, "2026-10-31").path("created").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-11-01").path("created").asInt()).isEqualTo(4);
		assertThat(day(summary, "2026-11-02").path("created").asInt()).isEqualTo(1);
		assertThat(summary.at("/created/value").asInt()).isEqualTo(6);
	}

	/** Noventa días de Madrid cruzan el cambio de octubre sin huecos ni fechas repetidas. */
	@Test
	void aNinetyDaySeriesAcrossMadridsChangesHasNoGapsOrDuplicates() throws Exception {
		Seeded madrid = organizationIn("Madrid", "Europe/Madrid");
		this.clock.set(at("2026-11-15T12:00:00+01:00"));
		madrid.ticket(this, "email", "2026-08-18T00:00:00+02:00"); // primer instante del periodo
		madrid.ticket(this, "email", "2026-08-17T23:59:59+02:00"); // un segundo antes: periodo anterior

		JsonNode summary = summary(madrid.email(), "90d");

		List<String> dates = dates(summary);
		assertThat(dates).hasSize(90).doesNotHaveDuplicates();
		assertThat(dates.get(0)).isEqualTo("2026-08-18");
		assertThat(dates.get(89)).isEqualTo("2026-11-15");
		assertThat(dates).isSorted();
		assertThat(day(summary, "2026-08-18").path("created").asInt()).isEqualTo(1);
		assertThat(summary.at("/created/value").asInt()).isEqualTo(1);
		assertThat(summary.at("/created/previous").asInt()).isEqualTo(1);
	}

	// --- Periodo anterior ---

	/** Acme: el periodo empieza el 28 a las 05:00 UTC y dura 6 d 10 h hasta «ahora»; el anterior, lo mismo hacia atrás. */
	@Test
	void previousPeriodHasTheSameLength() throws Exception {
		// from = 2026-09-28T05:00:00Z, to = 2026-10-04T15:00:00Z → previous = [2026-09-21T19:00:00Z, from)
		ticket("email", "2026-10-04T15:00:00Z"); // en «ahora»: cuenta en el periodo actual
		ticket("email", "2026-10-04T15:00:01Z"); // en el futuro: no cuenta en ninguno
		ticket("email", "2026-09-28T05:00:00Z"); // en el inicio: periodo actual
		ticket("email", "2026-09-28T04:59:59Z"); // un segundo antes: periodo anterior
		ticket("email", "2026-09-21T19:00:00Z"); // en el inicio del anterior: cuenta
		ticket("email", "2026-09-21T18:59:59Z"); // un segundo antes del anterior: no cuenta
		UUID inPrevious = ticket("email", "2026-09-25T00:00:00Z");
		UUID resolvedLater = ticket("email", "2026-09-10T00:00:00Z");
		this.data.changeStatus(this.acme, inPrevious, this.laura, "Laura Méndez", "resolved", at("2026-09-28T04:59:59Z"));
		this.data.changeStatus(this.acme, resolvedLater, this.laura, "Laura Méndez", "resolved", at("2026-09-28T05:00:00Z"));
		UUID tooOld = ticket("email", "2026-09-01T00:00:00Z");
		this.data.changeStatus(this.acme, tooOld, this.laura, "Laura Méndez", "resolved", at("2026-09-21T18:59:59Z"));

		JsonNode summary = summary(LAURA, "7d");

		assertThat(summary.at("/period/from").asString()).isEqualTo("2026-09-28T05:00:00Z");
		assertThat(summary.at("/period/to").asString()).isEqualTo("2026-10-04T15:00:00Z");
		assertThat(summary.at("/created/value").asInt()).isEqualTo(2);
		assertThat(summary.at("/created/previous").asInt()).isEqualTo(3);
		assertThat(summary.at("/resolved/value").asInt()).isEqualTo(1);
		assertThat(summary.at("/resolved/previous").asInt()).isEqualTo(1);
	}

	/** El periodo que cruza el cambio de hora sigue midiendo lo mismo en tiempo transcurrido, no en días de 24 h. */
	@Test
	void previousPeriodKeepsItsElapsedLengthAcrossADaylightSavingChange() throws Exception {
		Seeded madrid = organizationIn("Madrid", "Europe/Madrid");
		this.clock.set(at("2026-10-26T13:00:00+01:00"));
		// from = 2026-10-20T00:00+02:00 = 2026-10-19T22:00:00Z; to = 2026-10-26T12:00:00Z (6 d 14 h = 158 h)
		// previous = [2026-10-13T08:00:00Z, 2026-10-19T22:00:00Z)
		madrid.ticket(this, "web", "2026-10-13T08:00:00Z"); // cuenta
		madrid.ticket(this, "web", "2026-10-13T07:59:59Z"); // no cuenta
		madrid.ticket(this, "web", "2026-10-19T21:59:59Z"); // cuenta
		madrid.ticket(this, "web", "2026-10-19T22:00:00Z"); // periodo actual

		JsonNode summary = summary(madrid.email(), "7d");

		assertThat(summary.at("/created/value").asInt()).isEqualTo(1);
		assertThat(summary.at("/created/previous").asInt()).isEqualTo(2);
	}

	/** El reloj real trae nanosegundos: el informe termina en el segundo entero anterior, sin redondear hacia arriba. */
	@Test
	void theEndOfThePeriodIsTheRequestInstantTruncatedToTheSecond() throws Exception {
		this.clock.set(at("2026-10-04T15:00:00.400Z"));
		ticket("email", "2026-10-04T15:00:00.000Z"); // en el segundo exacto: cuenta
		ticket("email", "2026-10-04T15:00:00.300Z"); // después del final truncado: aparecerá en la siguiente carga

		JsonNode summary = summary(LAURA, "7d");

		assertThat(summary.at("/period/to").asString()).isEqualTo("2026-10-04T15:00:00Z");
		assertThat(summary.at("/period/from").asString()).isEqualTo("2026-09-28T05:00:00Z");
		assertThat(summary.at("/created/value").asInt()).isEqualTo(1);
	}

	/** En el último segundo del día local el informe sigue siendo de hoy: redondear hacia arriba lo movería a mañana. */
	@Test
	void aRequestInTheLastSecondOfTheLocalDayStillReportsToday() throws Exception {
		this.clock.set(at("2026-10-04T23:59:59.500-05:00"));
		ticket("email", "2026-09-28T12:00:00-05:00"); // primer día del periodo

		JsonNode summary = summary(LAURA, "7d");

		assertThat(summary.at("/period/from").asString()).isEqualTo("2026-09-28T05:00:00Z");
		assertThat(summary.at("/period/to").asString()).isEqualTo("2026-10-05T04:59:59Z");
		assertThat(dates(summary)).containsExactly("2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01",
				"2026-10-02", "2026-10-03", "2026-10-04");
		assertThat(day(summary, "2026-09-28").path("created").asInt()).isEqualTo(1);
		assertThat(summary.at("/created/value").asInt()).isEqualTo(1);
	}

	/** Las cinco consultas del informe se ejecutan en una transacción de solo lectura con aislamiento REPEATABLE READ. */
	@Test
	void allTheFiguresComeFromOneSnapshot() throws Exception {
		List<String> observed = new CopyOnWriteArrayList<>();
		Mockito.doAnswer((invocation) -> {
			observed.add(TransactionSynchronizationManager.isActualTransactionActive() + "/"
					+ TransactionSynchronizationManager.isCurrentTransactionReadOnly() + "/"
					+ TransactionSynchronizationManager.getCurrentTransactionIsolationLevel());
			return invocation.callRealMethod();
		}).when(this.jdbc).sql(ArgumentMatchers.anyString());

		summary(LAURA, "7d");

		// Ticket, resueltos, días, canales y agentes: todas con transacción activa, de solo lectura y nivel 4.
		assertThat(observed).containsExactly("true/true/4", "true/true/4", "true/true/4", "true/true/4", "true/true/4");
	}

	// --- Medianas ---

	@Test
	void medianFirstResponseAndResolutionIgnoreTicketsWithoutData() throws Exception {
		// Periodo actual: cuatro tickets con respuesta (10, 20, 30 y 41 min → mediana 25) y uno sin respuesta.
		int[] responseMinutes = { 10, 20, 30, 41 };
		for (int minutes : responseMinutes) {
			UUID ticket = ticket("email", "2026-10-01T12:00:00Z");
			this.data.agentMessage(this.acme, ticket, this.laura, "public", at("2026-10-01T12:00:00Z").plusSeconds(minutes * 60L));
		}
		UUID unanswered = ticket("email", "2026-10-01T12:00:00Z");
		// Una nota interna no es una respuesta.
		this.data.agentMessage(this.acme, unanswered, this.daniel, "internal", at("2026-10-01T12:05:00Z"));
		// Creado antes del periodo (y del anterior): la respuesta no entra en ninguna mediana.
		UUID tooOld = ticket("email", "2026-09-01T12:00:00Z");
		this.data.agentMessage(this.acme, tooOld, this.laura, "public", at("2026-09-01T20:00:00Z"));

		// Resolución: 2 h (resuelto, reabierto y resuelto otra vez a las 30 h: cuenta la primera) y 3,5 h → 2,75 → 2,8.
		UUID reopened = ticket("chat", "2026-10-02T00:00:00Z");
		this.data.changeStatus(this.acme, reopened, this.laura, "Laura Méndez", "resolved", at("2026-10-02T02:00:00Z"));
		this.data.changeStatus(this.acme, reopened, this.laura, "Laura Méndez", "open", at("2026-10-02T03:00:00Z"));
		this.data.changeStatus(this.acme, reopened, this.laura, "Laura Méndez", "resolved", at("2026-10-03T06:00:00Z"));
		UUID quick = ticket("chat", "2026-10-02T00:00:00Z");
		this.data.changeStatus(this.acme, quick, this.laura, "Laura Méndez", "resolved", at("2026-10-02T03:30:00Z"));

		// Periodo anterior: respuestas de 40 y 50 min (mediana 45); resoluciones de 3 h, 4 h y 72 h (una ya dentro
		// del periodo actual) → 4,0. Los tickets sin datos no cuentan.
		for (int minutes : new int[] { 40, 50 }) {
			UUID ticket = ticket("email", "2026-09-25T00:00:00Z");
			this.data.agentMessage(this.acme, ticket, this.daniel, "public", at("2026-09-25T00:00:00Z").plusSeconds(minutes * 60L));
		}
		for (int hours : new int[] { 3, 4, 72 }) {
			UUID ticket = ticket("web", "2026-09-26T00:00:00Z");
			this.data.changeStatus(this.acme, ticket, this.daniel, "Daniel Santos", "resolved",
					at("2026-09-26T00:00:00Z").plusSeconds(hours * 3600L));
		}

		JsonNode summary = summary(LAURA, "7d");

		assertThat(summary.at("/firstResponseMinutes/value").asInt()).isEqualTo(25);
		assertThat(summary.at("/firstResponseMinutes/previous").asInt()).isEqualTo(45);
		assertThat(summary.at("/firstResponseMinutes/target").asInt()).isEqualTo(30);
		assertThat(summary.at("/resolutionHours/value").asDouble()).isEqualTo(2.8);
		assertThat(summary.at("/resolutionHours/previous").asDouble()).isEqualTo(4.0);
	}

	// --- Canales ---

	@Test
	void byChannelSharesSumToOneHundred() throws Exception {
		// 3 de 7 = 42,857… %, 2 de 7 = 28,571… %, 1 de 7 = 14,285… %: redondear cada uno daría 100,1.
		for (String channel : List.of("email", "email", "email", "chat", "chat", "phone", "web")) {
			ticket(channel, "2026-10-02T12:00:00Z");
		}

		JsonNode channels = summary(LAURA, "7d").path("byChannel");

		assertThat(channels).hasSize(4);
		assertThat(channels.get(0).path("channel").asString()).isEqualTo("email");
		assertThat(channels.get(0).path("created").asInt()).isEqualTo(3);
		assertThat(shares(channels)).containsExactly("42.8", "28.6", "14.3", "14.3");
		assertThat(sum(channels)).isEqualByComparingTo("100.0");
		assertThat(channels.get(2).path("channel").asString()).isEqualTo("phone");
		assertThat(channels.get(3).path("channel").asString()).isEqualTo("web");
	}

	@Test
	void channelsThatTieShareTheRemainderInAStableOrder() throws Exception {
		for (String channel : List.of("phone", "web", "chat")) {
			ticket(channel, "2026-10-02T12:00:00Z");
		}

		JsonNode channels = summary(LAURA, "7d").path("byChannel");

		// Mismo número de tickets: se ordenan por nombre y el décimo sobrante va al primero.
		assertThat(channels.get(0).path("channel").asString()).isEqualTo("chat");
		assertThat(channels.get(1).path("channel").asString()).isEqualTo("phone");
		assertThat(channels.get(2).path("channel").asString()).isEqualTo("web");
		assertThat(shares(channels)).containsExactly("33.4", "33.3", "33.3");
		assertThat(sum(channels)).isEqualByComparingTo("100.0");
	}

	@Test
	void aSingleChannelHasAHundredPercentAndOthersAreOmitted() throws Exception {
		ticket("web", "2026-10-02T12:00:00Z");

		JsonNode channels = summary(LAURA, "7d").path("byChannel");

		assertThat(channels).hasSize(1);
		assertThat(channels.get(0).path("channel").asString()).isEqualTo("web");
		assertThat(shares(channels)).containsExactly("100.0");
	}

	// --- Reaperturas ---

	@Test
	void reopenedAndResolvedAgainCountsOnce() throws Exception {
		UUID sameDay = ticket("email", "2026-10-02T12:00:00Z");
		this.data.changeStatus(this.acme, sameDay, this.laura, "Laura Méndez", "resolved", at("2026-10-02T14:00:00Z"));
		this.data.changeStatus(this.acme, sameDay, this.laura, "Laura Méndez", "open", at("2026-10-02T15:00:00Z"));
		this.data.changeStatus(this.acme, sameDay, this.laura, "Laura Méndez", "resolved", at("2026-10-02T16:00:00Z"));

		JsonNode summary = summary(LAURA, "7d");

		assertThat(summary.at("/resolved/value").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-10-02").path("resolved").asInt()).isEqualTo(1);
		assertThat(agent(summary, "Laura Méndez").path("resolved").asInt()).isEqualTo(1);
	}

	@Test
	void aTicketResolvedAgainOnAnotherDayCountsOnceInThePeriodAndOnceEachDay() throws Exception {
		UUID ticket = ticket("email", "2026-10-01T12:00:00Z");
		this.data.changeStatus(this.acme, ticket, this.laura, "Laura Méndez", "resolved", at("2026-10-01T14:00:00Z"));
		this.data.changeStatus(this.acme, ticket, this.laura, "Laura Méndez", "open", at("2026-10-02T15:00:00Z"));
		this.data.changeStatus(this.acme, ticket, this.laura, "Laura Méndez", "resolved", at("2026-10-03T16:00:00Z"));

		JsonNode summary = summary(LAURA, "7d");

		assertThat(summary.at("/resolved/value").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-10-01").path("resolved").asInt()).isEqualTo(1);
		assertThat(day(summary, "2026-10-02").path("resolved").asInt()).isZero();
		assertThat(day(summary, "2026-10-03").path("resolved").asInt()).isEqualTo(1);
		assertThat(agent(summary, "Laura Méndez").path("resolved").asInt()).isEqualTo(1);
		// La resolución mide hasta la primera vez: 2 h.
		assertThat(summary.at("/resolutionHours/value").asDouble()).isEqualTo(2.0);
	}

	// --- Agentes ---

	@Test
	void byAgentCountsDistinctResolvedTicketsPerActor() throws Exception {
		UUID a = ticket("email", "2026-10-01T12:00:00Z");
		UUID b = ticket("email", "2026-10-01T12:00:00Z");
		UUID c = ticket("email", "2026-10-01T12:00:00Z");
		UUID d = ticket("email", "2026-10-01T12:00:00Z");
		// Laura resuelve A dos veces (reabierto), B, y D; Daniel resuelve C y D (otra persona lo resuelve tras reabrirlo).
		this.data.changeStatus(this.acme, a, this.laura, "Laura Méndez", "resolved", at("2026-10-02T10:00:00Z"));
		this.data.changeStatus(this.acme, a, this.laura, "Laura Méndez", "open", at("2026-10-02T11:00:00Z"));
		this.data.changeStatus(this.acme, a, this.laura, "Laura Méndez", "resolved", at("2026-10-02T12:00:00Z"));
		this.data.changeStatus(this.acme, b, this.laura, "Laura Méndez", "resolved", at("2026-10-02T13:00:00Z"));
		this.data.changeStatus(this.acme, c, this.daniel, "Daniel Santos", "resolved", at("2026-10-02T14:00:00Z"));
		this.data.changeStatus(this.acme, d, this.laura, "Laura Méndez", "resolved", at("2026-10-02T15:00:00Z"));
		this.data.changeStatus(this.acme, d, this.daniel, "Daniel Santos", "open", at("2026-10-02T16:00:00Z"));
		this.data.changeStatus(this.acme, d, this.daniel, "Daniel Santos", "resolved", at("2026-10-02T17:00:00Z"));
		// Resuelto antes del periodo: no cuenta.
		UUID old = ticket("email", "2026-09-01T12:00:00Z");
		this.data.changeStatus(this.acme, old, this.daniel, "Daniel Santos", "resolved", at("2026-09-02T12:00:00Z"));
		// Carga abierta: Laura tiene dos sin resolver y uno resuelto; Daniel, uno.
		this.data.assignTicket(ticket("web", "2026-10-03T12:00:00Z"), this.laura);
		UUID waiting = ticket("web", "2026-10-03T12:00:00Z");
		this.data.assignTicket(waiting, this.laura);
		this.data.changeStatus(this.acme, waiting, this.laura, "Laura Méndez", "waiting", at("2026-10-03T13:00:00Z"));
		this.data.assignTicket(a, this.laura);
		this.data.assignTicket(ticket("web", "2026-09-01T12:00:00Z"), this.daniel); // creado antes: sigue abierto

		JsonNode summary = summary(LAURA, "7d");

		assertThat(summary.at("/resolved/value").asInt()).isEqualTo(4); // A, B, C y D, sin repetir
		JsonNode agents = summary.path("byAgent");
		assertThat(names(agents)).containsExactly("Laura Méndez", "Daniel Santos", "Yelisson Ortiz");
		assertThat(agents.get(0).path("member").path("id").asString()).isEqualTo(this.laura.toString());
		assertThat(agents.get(0).path("resolved").asInt()).isEqualTo(3); // A, B y D
		assertThat(agents.get(1).path("resolved").asInt()).isEqualTo(2); // C y D
		assertThat(agents.get(2).path("resolved").asInt()).isZero();
		assertThat(agents.get(0).path("openAssigned").asInt()).isEqualTo(2); // A está resuelto
		assertThat(agents.get(1).path("openAssigned").asInt()).isEqualTo(1);
		assertThat(agents.get(2).path("openAssigned").asInt()).isZero();
	}

	@Test
	void byAgentFirstResponseUsesTheFirstPublicMessageOfEachTicket() throws Exception {
		// Laura responde primero a dos tickets (10 y 30 min → 20); Daniel, al tercero (60 min).
		UUID one = ticket("email", "2026-10-01T12:00:00Z");
		UUID two = ticket("email", "2026-10-01T12:00:00Z");
		UUID three = ticket("email", "2026-10-01T12:00:00Z");
		this.data.agentMessage(this.acme, one, this.daniel, "internal", at("2026-10-01T12:05:00Z")); // nota: no cuenta
		// Un mensaje público del cliente antes de la respuesta no es «el primer mensaje público del agente».
		this.data.customerMessage(this.acme, one, this.customer, at("2026-10-01T12:02:00Z"));
		this.data.customerMessage(this.acme, two, this.customer, at("2026-10-01T12:00:30Z"));
		this.data.agentMessage(this.acme, one, this.laura, "public", at("2026-10-01T12:10:00Z"));
		this.data.agentMessage(this.acme, two, this.laura, "public", at("2026-10-01T12:30:00Z"));
		this.data.agentMessage(this.acme, three, this.daniel, "public", at("2026-10-01T13:00:00Z"));
		this.data.agentMessage(this.acme, three, this.laura, "public", at("2026-10-01T13:05:00Z")); // ya hubo primera
		// Creado antes del periodo: no entra.
		UUID old = ticket("email", "2026-09-01T12:00:00Z");
		this.data.agentMessage(this.acme, old, this.daniel, "public", at("2026-09-01T20:00:00Z"));

		JsonNode summary = summary(LAURA, "7d");

		assertThat(agent(summary, "Laura Méndez").path("firstResponseMinutes").asInt()).isEqualTo(20);
		assertThat(agent(summary, "Daniel Santos").path("firstResponseMinutes").asInt()).isEqualTo(60);
		assertThat(agent(summary, "Yelisson Ortiz").path("firstResponseMinutes").isNull()).isTrue();
	}

	/**
	 * Decisión: quien ya no es personal activo aparece si resolvió tickets o dio una primera respuesta en el periodo,
	 * con su estado, para que el trabajo hecho no desaparezca del informe.
	 */
	@Test
	void aMemberWhoLeftAppearsOnlyWithResolutionsOrFirstResponsesInThePeriod() throws Exception {
		UUID rita = this.data.staff(this.acme, "agent", "Rita Vega", "rita@acme.example", "removed");
		this.data.staff(this.acme, "agent", "Sara Gil", "sara@acme.example", "removed");
		UUID tomas = this.data.staff(this.acme, "agent", "Tomás Ibarra", "tomas@acme.example", "removed");
		this.data.staff(this.acme, "agent", "Iván Ortiz", "ivan@acme.example", "invited");
		// Retirada, invitada de nuevo y todavía sin entrar: su trabajo del periodo tampoco desaparece.
		UUID irene = this.data.staff(this.acme, "agent", "Irene Paz", "irene@acme.example", "invited");
		UUID inPeriod = ticket("email", "2026-10-01T12:00:00Z");
		this.data.changeStatus(this.acme, inPeriod, rita, "Rita Vega", "resolved", at("2026-10-02T12:00:00Z"));
		UUID byIrene = ticket("email", "2026-10-01T12:00:00Z");
		this.data.changeStatus(this.acme, byIrene, irene, "Irene Paz", "resolved", at("2026-10-02T13:00:00Z"));
		UUID before = ticket("email", "2026-09-01T12:00:00Z");
		this.data.changeStatus(this.acme, before, tomas, "Tomás Ibarra", "resolved", at("2026-09-02T12:00:00Z"));
		// Retirada que solo dio una primera respuesta en el periodo (sin resolver nada): también aparece.
		UUID nuria = this.data.staff(this.acme, "agent", "Nuria Bel", "nuria@acme.example", "removed");
		UUID answered = ticket("email", "2026-10-01T12:00:00Z");
		this.data.agentMessage(this.acme, answered, nuria, "public", at("2026-10-01T12:20:00Z"));

		JsonNode summary = summary(LAURA, "7d");

		assertThat(names(summary.path("byAgent"))).containsExactly("Irene Paz", "Rita Vega", "Daniel Santos",
				"Laura Méndez", "Nuria Bel", "Yelisson Ortiz");
		assertThat(statuses(summary.path("byAgent"))).containsExactly("invited", "removed", "active", "active",
				"removed", "active");
		assertThat(agent(summary, "Nuria Bel").path("resolved").asInt()).isZero();
		assertThat(agent(summary, "Nuria Bel").path("firstResponseMinutes").asInt()).isEqualTo(20);
		assertThat(agent(summary, "Rita Vega").path("resolved").asInt()).isEqualTo(1);
		assertThat(agent(summary, "Rita Vega").path("openAssigned").asInt()).isZero();
		assertThat(agent(summary, "Irene Paz").path("resolved").asInt()).isEqualTo(1);
		assertThat(summary.at("/resolved/value").asInt()).isEqualTo(2);
	}

	@Test
	void aMemberOfTwoOrganizationsOnlyCountsTheWorkOfTheOrganizationThatAsks() throws Exception {
		UUID elena = this.data.staff(this.acme, "agent", "Elena Rojas", "elena@acme.example");
		this.data.membership(this.northwind, elena, "agent", "active");
		UUID acmeTicket = ticket("email", "2026-10-01T12:00:00Z");
		this.data.changeStatus(this.acme, acmeTicket, elena, "Elena Rojas", "resolved", at("2026-10-02T12:00:00Z"));
		this.data.assignTicket(ticket("email", "2026-10-02T12:00:00Z"), elena);
		for (int i = 0; i < 3; i++) {
			UUID foreign = ticket(this.northwind, this.northwindCustomer, "chat", "2026-10-01T12:00:00Z");
			this.data.changeStatus(this.northwind, foreign, elena, "Elena Rojas", "resolved", at("2026-10-02T12:00:00Z"));
		}
		this.data.assignTicket(ticket(this.northwind, this.northwindCustomer, "chat", "2026-10-02T12:00:00Z"), elena);

		JsonNode acmeReport = summary(LAURA, "7d");
		JsonNode northwindReport = summary(NORTHWIND_AGENT, "7d");

		assertThat(agent(acmeReport, "Elena Rojas").path("resolved").asInt()).isEqualTo(1);
		assertThat(agent(acmeReport, "Elena Rojas").path("openAssigned").asInt()).isEqualTo(1);
		assertThat(acmeReport.at("/created/value").asInt()).isEqualTo(2);
		assertThat(agent(northwindReport, "Elena Rojas").path("resolved").asInt()).isEqualTo(3);
		assertThat(agent(northwindReport, "Elena Rojas").path("openAssigned").asInt()).isEqualTo(1);
		assertThat(northwindReport.at("/created/value").asInt()).isEqualTo(4);
	}

	// --- Sin datos, aislamiento, periodos y permisos ---

	@Test
	void emptyOrganizationReturnsZerosAndNulls() throws Exception {
		JsonNode summary = summary(LAURA, "7d");

		assertThat(summary.at("/created/value").asInt()).isZero();
		assertThat(summary.at("/created/previous").asInt()).isZero();
		assertThat(summary.at("/resolved/value").asInt()).isZero();
		assertThat(summary.at("/resolved/previous").asInt()).isZero();
		assertThat(summary.at("/firstResponseMinutes/value").isNull()).isTrue();
		assertThat(summary.at("/firstResponseMinutes/previous").isNull()).isTrue();
		assertThat(summary.at("/firstResponseMinutes/target").asInt()).isEqualTo(30);
		assertThat(summary.at("/resolutionHours/value").isNull()).isTrue();
		assertThat(summary.at("/resolutionHours/previous").isNull()).isTrue();
		assertThat(summary.path("byDay")).hasSize(7);
		summary.path("byDay").forEach((day) -> {
			assertThat(day.path("created").asInt()).isZero();
			assertThat(day.path("resolved").asInt()).isZero();
		});
		assertThat(summary.path("byChannel")).isEmpty();
		// El equipo activo aparece aunque no haya hecho nada, por nombre.
		assertThat(names(summary.path("byAgent"))).containsExactly("Daniel Santos", "Laura Méndez", "Yelisson Ortiz");
		summary.path("byAgent").forEach((agent) -> {
			assertThat(agent.path("resolved").asInt()).isZero();
			assertThat(agent.path("openAssigned").asInt()).isZero();
			assertThat(agent.path("firstResponseMinutes").isNull()).isTrue();
		});
	}

	@Test
	void twoOrganizationsDoNotSeeEachOthersFigures() throws Exception {
		ticket("email", "2026-10-02T12:00:00Z");
		UUID foreign = ticket(this.northwind, this.northwindCustomer, "phone", "2026-10-02T12:00:00Z");
		this.data.changeStatus(this.northwind, foreign, this.northwindAgent, "Jordi Puig", "resolved",
				at("2026-10-02T14:00:00Z"));
		this.data.agentMessage(this.northwind, foreign, this.northwindAgent, "public", at("2026-10-02T12:03:00Z"));

		JsonNode acmeReport = summary(LAURA, "7d");
		JsonNode northwindReport = summary(NORTHWIND_AGENT, "7d");

		assertThat(acmeReport.at("/created/value").asInt()).isEqualTo(1);
		assertThat(acmeReport.at("/resolved/value").asInt()).isZero();
		assertThat(acmeReport.at("/firstResponseMinutes/value").isNull()).isTrue();
		assertThat(acmeReport.path("byChannel")).hasSize(1);
		assertThat(acmeReport.path("byChannel").get(0).path("channel").asString()).isEqualTo("email");
		assertThat(names(acmeReport.path("byAgent"))).doesNotContain("Jordi Puig");
		assertThat(northwindReport.at("/created/value").asInt()).isEqualTo(1);
		assertThat(northwindReport.at("/resolved/value").asInt()).isEqualTo(1);
		assertThat(northwindReport.at("/firstResponseMinutes/value").asInt()).isEqualTo(3);
		assertThat(northwindReport.at("/firstResponseMinutes/target").asInt()).isEqualTo(30);
		assertThat(northwindReport.at("/period/timeZone").asString()).isEqualTo("Europe/Madrid");
		assertThat(names(northwindReport.path("byAgent"))).containsExactly("Jordi Puig");
	}

	@Test
	void thePeriodDefaultsToSevenDaysAndAcceptsLongerOnes() throws Exception {
		assertThat(summary(LAURA, null).at("/period/days").asInt()).isEqualTo(7);
		assertThat(summary(LAURA, null).path("byDay")).hasSize(7);
		JsonNode thirty = summary(LAURA, "30d");
		assertThat(thirty.at("/period/days").asInt()).isEqualTo(30);
		assertThat(thirty.path("byDay")).hasSize(30);
		assertThat(thirty.at("/period/from").asString()).isEqualTo("2026-09-05T05:00:00Z");
		JsonNode ninety = summary(LAURA, "90d");
		assertThat(ninety.at("/period/days").asInt()).isEqualTo(90);
		assertThat(ninety.path("byDay")).hasSize(90);
		assertThat(ninety.path("byDay").get(0).path("date").asString()).isEqualTo("2026-07-07");
		assertThat(ninety.path("byDay").get(89).path("date").asString()).isEqualTo("2026-10-04");
	}

	@Test
	void anInvalidPeriodIsRejectedWithAFieldError() throws Exception {
		for (String period : List.of("1d", "7", "7D", "30d,90d")) {
			this.mvc.perform(get(API + "/reports/summary").queryParam("period", period).with(as(LAURA)))
				.andExpect(status().isBadRequest())
				.andExpect(matchesContract("getReportSummary"))
				.andExpect(jsonPath("$.errors[0].field").value("period"));
		}
	}

	@Test
	void anAgentAndAnAdminCanReadTheReport() throws Exception {
		summary(ADMIN, "7d");
		summary(DANIEL, "30d");
	}

	@Test
	void aCustomerGets403() throws Exception {
		this.mvc.perform(get(API + "/reports/summary").with(as(MARIA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("getReportSummary"));
		// Ni siquiera con un periodo inválido: el rol se comprueba antes que los parámetros.
		this.mvc.perform(get(API + "/reports/summary").queryParam("period", "x").with(as(MARIA)))
			.andExpect(status().isForbidden());
	}

	@Test
	void withoutAPrincipalTheReportIs401() throws Exception {
		this.mvc.perform(get(API + "/reports/summary"))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("getReportSummary"));
	}

	// --- Utilidades ---

	private static JsonNode agent(JsonNode summary, String name) {
		for (JsonNode agent : summary.path("byAgent")) {
			if (name.equals(agent.path("member").path("name").asString())) {
				return agent;
			}
		}
		throw new AssertionError("El informe no tiene al agente " + name + ": " + summary.path("byAgent"));
	}

	private static List<String> names(JsonNode agents) {
		return agents.valueStream().map((agent) -> agent.path("member").path("name").asString()).toList();
	}

	private static List<String> statuses(JsonNode agents) {
		return agents.valueStream().map((agent) -> agent.path("status").asString()).toList();
	}

	private static List<String> shares(JsonNode channels) {
		return channels.valueStream().map((channel) -> channel.path("share").decimalValue().toPlainString()).toList();
	}

	private static BigDecimal sum(JsonNode channels) {
		return channels.valueStream()
			.map((channel) -> channel.path("share").decimalValue())
			.reduce(BigDecimal.ZERO, BigDecimal::add);
	}

}
