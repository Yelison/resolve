package com.resolve.api.tickets;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * «Necesitan atención»: qué tickets, por qué y en qué orden, calculado en el servidor sobre todo el alcance. Cada regla
 * tiene su test; todos los instantes se fijan respecto a {@link #NOW}, que es la hora de la consulta.
 */
class TicketAttentionApiTest extends TicketsFixture {

	private static final Instant NOW = Instant.parse("2026-10-06T12:00:00Z");

	private static final Duration HOUR = Duration.ofHours(1);

	private static final Duration DAY = Duration.ofDays(1);

	@Autowired
	private JdbcClient jdbc;

	private static Duration minutes(int minutes) {
		return Duration.ofMinutes(minutes);
	}

	private static Duration hours(int hours) {
		return Duration.ofHours(hours);
	}

	private static Duration days(int days) {
		return Duration.ofDays(days);
	}

	/** Un ticket sembrado: su número y su id. */
	private record Seed(long number, UUID id) {
	}

	@Test
	void everyReasonIsReportedInTheOrderOfTheList() throws Exception {
		Seed high = ticket("Alta con respuesta", "high", this.laura, hours(6));
		inProgress(high, hours(6));
		agentMessage(high, this.laura, "public", "Ya lo miro", minutes(10));
		Seed waiting = ticket("Esperando al cliente", "medium", this.laura, days(5));
		setStatus(waiting, "waiting", days(2));
		Seed replied = ticket("El cliente contestó", "medium", this.laura, hours(5));
		inProgress(replied, hours(5));
		customerMessage(replied, "Sigue **sin** funcionar, [mira](https://ejemplo.test)", minutes(40));
		Seed unassigned = ticket("Nadie lo tiene", "low", null, minutes(20));
		Seed unanswered = ticket("Sin respuesta", "medium", this.laura, hours(5));
		Seed urgent = ticket("Urgente", "urgent", this.laura, hours(3));
		Seed quiet = ticket("Todo en orden", "medium", this.laura, hours(5));
		inProgress(quiet, hours(5));
		agentMessage(quiet, this.laura, "public", "Respondido", minutes(30));
		Seed resolved = ticket("Urgente pero resuelto", "urgent", this.laura, hours(5));
		setStatus(resolved, "resolved", hours(4));

		JsonNode result = attention(LAURA, "team", null);

		assertThat(numbers(result)).containsExactly(urgent.number(), unanswered.number(), unassigned.number(),
				replied.number(), high.number(), waiting.number());
		assertThat(kinds(result)).containsExactly("urgent", "unanswered", "unassigned", "customer_replied", "high",
				"waiting");
		assertThat(result.path("total").asInt()).isEqualTo(6);
		// «open» cuenta todo lo que no está resuelto, tenga o no motivo.
		assertThat(result.path("open").asInt()).isEqualTo(7);
		assertThat(numbers(result)).doesNotContain(quiet.number(), resolved.number());
		// Cada motivo dice desde cuándo, y solo «el cliente respondió» lleva el extracto, en texto plano.
		assertThat(since(result, 0)).isEqualTo(NOW.minus(hours(3)));
		assertThat(since(result, 1)).isEqualTo(NOW.minus(hours(5)));
		assertThat(since(result, 2)).isEqualTo(NOW.minus(minutes(20)));
		assertThat(since(result, 3)).isEqualTo(NOW.minus(minutes(40)));
		assertThat(since(result, 4)).isEqualTo(NOW.minus(hours(6)));
		assertThat(since(result, 5)).isEqualTo(NOW.minus(days(2)));
		assertThat(result.at("/items/3/reason/excerpt").asString()).isEqualTo("Sigue sin funcionar, mira");
		for (int index : new int[] { 0, 1, 2, 4, 5 }) {
			assertThat(result.at("/items/" + index + "/reason/excerpt").isNull()).isTrue();
		}
		// El ticket trae lo que necesita su fila.
		JsonNode first = result.at("/items/0/ticket");
		assertThat(first.path("subject").asString()).isEqualTo("Urgente");
		assertThat(first.at("/customer/name").asString()).isEqualTo("María Pérez");
		assertThat(first.at("/assignee/name").asString()).isEqualTo("Laura Méndez");
		assertThat(result.at("/items/2/ticket/assignee").isNull()).isTrue();
	}

	@Test
	void urgentWinsOverEveryOtherReason() throws Exception {
		// Sin responsable, nuevo y sin mensajes desde hace horas: cumpliría «sin respuesta» y «sin asignar».
		Seed urgent = ticket("Urgente sin nadie", "urgent", null, hours(5));

		JsonNode result = attention(LAURA, "team", null);

		assertThat(numbers(result)).containsExactly(urgent.number());
		assertThat(kinds(result)).containsExactly("urgent");
	}

	@Test
	void aNewTicketIsUnansweredFromOneHourOnAndItCountsFromItsCreation() throws Exception {
		Seed exactly = ticket("Justo una hora", "medium", this.laura, HOUR);
		Seed shortly = ticket("Casi una hora", "medium", this.laura, minutes(59));

		JsonNode result = attention(LAURA, "team", null);

		assertThat(numbers(result)).containsExactly(exactly.number());
		assertThat(kinds(result)).containsExactly("unanswered");
		assertThat(since(result, 0)).isEqualTo(NOW.minus(HOUR));
		assertThat(result.path("open").asInt()).isEqualTo(2);
		assertThat(numbers(result)).doesNotContain(shortly.number());
	}

	@Test
	void aTicketWhoseLastPublicMessageIsTheCustomersIsUnansweredFromThatMessage() throws Exception {
		Seed ticket = ticket("El cliente insiste", "medium", this.laura, hours(9));
		agentMessage(ticket, this.laura, "public", "Te respondemos hoy", hours(8));
		customerMessage(ticket, "¿Alguna novedad?", hours(2));

		JsonNode result = attention(LAURA, "team", null);

		assertThat(kinds(result)).containsExactly("unanswered");
		assertThat(since(result, 0)).isEqualTo(NOW.minus(hours(2)));
	}

	@Test
	void anAgentReplyAnswersAnOpenTicket() throws Exception {
		Seed ticket = ticket("Ya contestado", "medium", this.laura, hours(9));
		customerMessage(ticket, "Hola", hours(8));
		agentMessage(ticket, this.laura, "public", "Hola, ya lo vemos", hours(7));

		assertThat(attention(LAURA, "team", null).path("items")).isEmpty();
	}

	/** L2 de la revisión de Inicio: una nota interna no es una respuesta. */
	@Test
	void anInternalNoteAloneDoesNotAnswerANewTicket() throws Exception {
		Seed ticket = ticket("Solo una nota", "medium", this.laura, hours(3));
		agentMessage(ticket, this.laura, "internal", "Lo consulto con facturación", hours(2));

		JsonNode result = attention(LAURA, "team", null);

		assertThat(numbers(result)).containsExactly(ticket.number());
		assertThat(kinds(result)).containsExactly("unanswered");
		assertThat(since(result, 0)).isEqualTo(NOW.minus(hours(3)));
	}

	/** L2 de la revisión de Inicio: una nota interna al final no tapa que el cliente escribió el último mensaje público. */
	@Test
	void anInternalNoteAfterTheCustomersMessageDoesNotHideIt() throws Exception {
		Seed open = ticket("Nota después del cliente", "medium", this.laura, hours(5));
		customerMessage(open, "No me llega el correo", hours(3));
		agentMessage(open, this.laura, "internal", "Lo consulto con facturación", hours(2));
		Seed underway = ticket("En curso con nota", "medium", this.laura, hours(5));
		inProgress(underway, hours(5));
		customerMessage(underway, "Sigue sin llegar", minutes(40));
		agentMessage(underway, this.laura, "internal", "Revisando los registros", minutes(30));

		JsonNode result = attention(LAURA, "team", null);

		assertThat(numbers(result)).containsExactly(open.number(), underway.number());
		assertThat(kinds(result)).containsExactly("unanswered", "customer_replied");
		assertThat(since(result, 0)).isEqualTo(NOW.minus(hours(3)));
		assertThat(since(result, 1)).isEqualTo(NOW.minus(minutes(40)));
		// El extracto es el del mensaje del cliente, no el de la nota.
		assertThat(result.at("/items/1/reason/excerpt").asString()).isEqualTo("Sigue sin llegar");
	}

	/** La autoría se decide por el tipo de autor, no por el nombre: una agente que se llama como la clienta no es la clienta. */
	@Test
	void anAgentWhoSharesTheCustomersNameIsNotTheCustomer() throws Exception {
		UUID namesake = this.data.staff(this.acme, "agent", "María Pérez", "maria.agente@acme.example");
		Seed ticket = ticket("Respondió la homónima", "medium", this.laura, hours(5));
		inProgress(ticket, hours(5));
		agentMessage(ticket, namesake, "public", "Ya lo tengo", minutes(40));

		assertThat(attention(LAURA, "team", null).path("items")).isEmpty();
	}

	@Test
	void customerRepliedAppliesToAnyOpenStatusAndTheExcerptIsCutAtOneHundredFortyCharacters() throws Exception {
		Seed ticket = ticket("Mensaje largo", "medium", this.laura, hours(5));
		inProgress(ticket, hours(5));
		customerMessage(ticket, "palabra ".repeat(60), minutes(10));

		JsonNode result = attention(LAURA, "team", null);

		assertThat(kinds(result)).containsExactly("customer_replied");
		String excerpt = result.at("/items/0/reason/excerpt").asString();
		assertThat(excerpt).hasSize(140).endsWith("…");
	}

	@Test
	void aTicketWithoutAssigneeIsUnassignedWhateverItsStatus() throws Exception {
		Seed fresh = ticket("Recién llegado", "medium", null, minutes(10));
		Seed progress = ticket("En curso sin dueño", "low", null, hours(3));
		inProgress(progress, hours(3));
		agentMessage(progress, this.laura, "public", "Lo estamos viendo", HOUR);

		JsonNode result = attention(LAURA, "team", null);

		assertThat(kinds(result)).containsExactly("unassigned", "unassigned");
		// El que lleva más tiempo así va primero.
		assertThat(numbers(result)).containsExactly(progress.number(), fresh.number());
	}

	@Test
	void highPriorityIsAReasonWhenNothingElseApplies() throws Exception {
		Seed ticket = ticket("Alta", "high", this.laura, hours(5));
		inProgress(ticket, hours(5));
		agentMessage(ticket, this.laura, "public", "En ello", minutes(30));

		JsonNode result = attention(LAURA, "team", null);

		assertThat(kinds(result)).containsExactly("high");
		assertThat(since(result, 0)).isEqualTo(NOW.minus(hours(5)));
	}

	@Test
	void waitingForTheCustomerCountsFromOneDayOfInactivity() throws Exception {
		Seed exactly = ticket("Un día esperando", "medium", this.laura, days(5));
		setStatus(exactly, "waiting", DAY);
		Seed shortly = ticket("Casi un día", "medium", this.laura, days(5));
		setStatus(shortly, "waiting", DAY.minusMinutes(1));

		JsonNode result = attention(LAURA, "team", null);

		assertThat(numbers(result)).containsExactly(exactly.number());
		assertThat(kinds(result)).containsExactly("waiting");
		assertThat(since(result, 0)).isEqualTo(NOW.minus(DAY));
		assertThat(result.path("open").asInt()).isEqualTo(2);
	}

	@Test
	void resolvedTicketsNeverNeedAttentionAndDoNotCountAsOpen() throws Exception {
		Seed ticket = ticket("Urgente y resuelto", "urgent", null, hours(5));
		setStatus(ticket, "resolved", HOUR);

		JsonNode result = attention(LAURA, "team", null);

		assertThat(result.path("items")).isEmpty();
		assertThat(result.path("total").asInt()).isZero();
		assertThat(result.path("open").asInt()).isZero();
	}

	@Test
	void withinAReasonTheOneThatHasWaitedLongestComesFirstAndTiesGoToTheHigherNumber() throws Exception {
		Seed recent = ticket("Urgente reciente", "urgent", this.laura, HOUR);
		Seed oldest = ticket("Urgente antiguo", "urgent", this.laura, hours(10));
		Seed tieFirst = ticket("Urgente empatado A", "urgent", this.laura, hours(4));
		Seed tieSecond = ticket("Urgente empatado B", "urgent", this.laura, hours(4));

		JsonNode result = attention(LAURA, "team", null);

		assertThat(numbers(result)).containsExactly(oldest.number(), tieSecond.number(), tieFirst.number(),
				recent.number());
	}

	/** El límite que tenía el cliente: sobre 100 candidatos por prioridad se escapaba lo de prioridad media. */
	@Test
	void thereIsNoCapOnTheTicketsConsidered() throws Exception {
		// 120 altas en curso y con respuesta (solo «alta»), todas con más prioridad que el ticket de abajo.
		this.jdbc.sql("""
				INSERT INTO tickets (id, organization_id, number, subject, description, status, priority, channel,
				                     customer_id, assignee_id, version, created_at, updated_at)
				SELECT gen_random_uuid(), :organization, 1000 + n, 'Alta ' || n, 'Detalle', 'in_progress', 'high', 'email',
				       :customer, :assignee, 0, :createdAt, :createdAt
				FROM generate_series(1, 120) AS n
				""")
			.param("organization", this.acme)
			.param("customer", this.mariaCustomer)
			.param("assignee", this.laura)
			.param("createdAt", Timestamp.from(NOW.minus(hours(5))))
			.update();
		Seed unanswered = ticket("Media sin respuesta", "medium", this.laura, hours(3));

		JsonNode result = attention(LAURA, "team", "3");

		assertThat(numbers(result).get(0)).isEqualTo(unanswered.number());
		assertThat(kinds(result)).containsExactly("unanswered", "high", "high");
		assertThat(result.path("total").asInt()).isEqualTo(121);
		assertThat(result.path("open").asInt()).isEqualTo(121);
	}

	@Test
	void mineOnlyEvaluatesTheTicketsAssignedToTheCaller() throws Exception {
		Seed mine = ticket("Mío urgente", "urgent", this.laura, hours(3));
		Seed theirs = ticket("De Daniel urgente", "urgent", this.daniel, hours(3));
		Seed nobody = ticket("Sin nadie", "medium", null, hours(5));

		JsonNode lauraMine = attention(LAURA, "mine", null);
		JsonNode lauraTeam = attention(LAURA, "team", null);
		JsonNode danielMine = attention(DANIEL, "mine", null);

		assertThat(numbers(lauraMine)).containsExactly(mine.number());
		assertThat(lauraMine.path("total").asInt()).isEqualTo(1);
		assertThat(lauraMine.path("open").asInt()).isEqualTo(1);
		assertThat(numbers(lauraTeam)).containsExactlyInAnyOrder(mine.number(), theirs.number(), nobody.number());
		assertThat(lauraTeam.path("open").asInt()).isEqualTo(3);
		assertThat(numbers(danielMine)).containsExactly(theirs.number());
	}

	@Test
	void anotherOrganizationNeverShowsUpNorCounts() throws Exception {
		Seed own = ticket("De Acme", "urgent", this.laura, hours(3));
		this.clock.set(NOW.minus(hours(5)));
		JsonNode foreign = createTicket(NORTHWIND_AGENT, this.northwindCustomer, "De Northwind", "urgent", null);
		UUID foreignId = UUID.fromString(foreign.path("id").asString());
		this.jdbc.sql("""
				INSERT INTO ticket_messages (id, organization_id, ticket_id, visibility, author_kind, author_customer_id,
				                             body, created_at)
				VALUES (?, ?, ?, 'public', 'customer', ?, 'Mensaje ajeno', ?)
				""")
			.params(UUID.randomUUID(), this.northwind, foreignId, this.northwindCustomer,
					Timestamp.from(NOW.minus(hours(4))))
			.update();

		JsonNode acme = attention(LAURA, "team", null);
		JsonNode northwind = attention(NORTHWIND_AGENT, "team", null);

		assertThat(numbers(acme)).containsExactly(own.number());
		assertThat(acme.path("total").asInt()).isEqualTo(1);
		assertThat(acme.path("open").asInt()).isEqualTo(1);
		assertThat(northwind.at("/items/0/ticket/subject").asString()).isEqualTo("De Northwind");
		assertThat(northwind.path("items")).hasSize(1);
		assertThat(northwind.path("open").asInt()).isEqualTo(1);
		assertThat(northwind.at("/items/0/ticket/customer/name").asString()).isEqualTo("Marta Soler");
	}

	@Test
	void sizeLimitsTheItemsButNotTheCounts() throws Exception {
		for (int i = 1; i <= 8; i++) {
			ticket("Urgente " + i, "urgent", this.laura, hours(10 + i));
		}

		JsonNode byDefault = attention(LAURA, "team", null);
		JsonNode two = attention(LAURA, "team", "2");
		JsonNode all = attention(LAURA, "team", "50");

		assertThat(byDefault.path("items")).hasSize(6);
		assertThat(two.path("items")).hasSize(2);
		assertThat(all.path("items")).hasSize(8);
		for (JsonNode result : List.of(byDefault, two, all)) {
			assertThat(result.path("total").asInt()).isEqualTo(8);
			assertThat(result.path("open").asInt()).isEqualTo(8);
		}
		assertThat(numbers(two)).containsExactly(8L, 7L);
	}

	@Test
	void anEmptyScopeHasNoItemsAndZeroCounts() throws Exception {
		this.mvc.perform(get(API + "/tickets/attention").queryParam("scope", "team").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listTicketsNeedingAttention"))
			.andExpect(jsonPath("$.items", hasSize(0)))
			.andExpect(jsonPath("$.total").value(0))
			.andExpect(jsonPath("$.open").value(0));
	}

	@Test
	void ticketsWithoutReasonStillCountAsOpen() throws Exception {
		Seed ticket = ticket("En orden", "medium", this.laura, hours(5));
		inProgress(ticket, hours(5));
		agentMessage(ticket, this.laura, "public", "Resuelto en breve", minutes(30));

		JsonNode result = attention(LAURA, "mine", null);

		assertThat(result.path("items")).isEmpty();
		assertThat(result.path("total").asInt()).isZero();
		assertThat(result.path("open").asInt()).isEqualTo(1);
	}

	@Test
	void anInvalidScopeOrSizeIsRejectedWithFieldErrors() throws Exception {
		for (String scope : new String[] { null, "", "todo", "MINE" }) {
			MockHttpServletRequestBuilder request = get(API + "/tickets/attention").with(as(LAURA));
			if (scope != null) {
				request = request.queryParam("scope", scope);
			}
			this.mvc.perform(request)
				.andExpect(status().isBadRequest())
				.andExpect(matchesContract("listTicketsNeedingAttention"))
				.andExpect(jsonPath("$.errors[0].field").value("scope"));
		}
		for (String size : new String[] { "0", "51", "-1", "abc", "1.5" }) {
			this.mvc.perform(get(API + "/tickets/attention").queryParam("scope", "team")
				.queryParam("size", size)
				.with(as(LAURA)))
				.andExpect(status().isBadRequest())
				.andExpect(matchesContract("listTicketsNeedingAttention"))
				.andExpect(jsonPath("$.errors[0].field").value("size"));
		}
		this.mvc.perform(get(API + "/tickets/attention").queryParam("scope", "x").queryParam("size", "0").with(as(LAURA)))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[*].field").value(containsInAnyOrder("scope", "size")));
	}

	/** «attention» también casa con «/tickets/{number}»: el 403 debe llegar antes que cualquier lectura de parámetros. */
	@Test
	void aCustomerGets403EvenWithInvalidParameters() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "De María", "urgent", null);

		for (String scope : new String[] { "team", "mine", "no-valido" }) {
			this.mvc.perform(get(API + "/tickets/attention").queryParam("scope", scope).with(as(MARIA)))
				.andExpect(status().isForbidden())
				.andExpect(matchesContract("listTicketsNeedingAttention"));
		}
		this.mvc.perform(get(API + "/tickets/attention").with(as(MARIA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("listTicketsNeedingAttention"));
		this.mvc.perform(get(API + "/tickets/attention").queryParam("scope", "team").queryParam("size", "abc").with(as(MARIA)))
			.andExpect(status().isForbidden());
	}

	@Test
	void withoutAPrincipalItIs401() throws Exception {
		this.mvc.perform(get(API + "/tickets/attention").queryParam("scope", "team"))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("listTicketsNeedingAttention"));
	}

	// --- Siembra -------------------------------------------------------------------------------------------------

	/** Crea un ticket de María, con la edad indicada respecto a {@link #NOW}; sin responsable si {@code assignee} es null. */
	private Seed ticket(String subject, String priority, UUID assignee, Duration age) throws Exception {
		this.clock.set(NOW.minus(age));
		JsonNode created = createTicket(LAURA, this.mariaCustomer, subject, priority, assignee);
		return new Seed(created.path("number").asLong(), UUID.fromString(created.path("id").asString()));
	}

	private void inProgress(Seed ticket, Duration ago) throws Exception {
		setStatus(ticket, "in_progress", ago);
	}

	/** Cambia el estado en ese instante (una sola vez por ticket: asume la versión 0). */
	private void setStatus(Seed ticket, String status, Duration ago) throws Exception {
		this.clock.set(NOW.minus(ago));
		patchTicket(LAURA, ticket.number(), 0, "{\"status\": \"%s\"}".formatted(status));
	}

	private void agentMessage(Seed ticket, UUID author, String visibility, String body, Duration ago) {
		this.jdbc.sql("""
				INSERT INTO ticket_messages (id, organization_id, ticket_id, visibility, author_kind, author_user_id, body,
				                             created_at)
				VALUES (?, ?, ?, ?, 'agent', ?, ?, ?)
				""")
			.params(UUID.randomUUID(), this.acme, ticket.id(), visibility, author, body, Timestamp.from(NOW.minus(ago)))
			.update();
	}

	private void customerMessage(Seed ticket, String body, Duration ago) {
		this.jdbc.sql("""
				INSERT INTO ticket_messages (id, organization_id, ticket_id, visibility, author_kind, author_customer_id,
				                             body, created_at)
				VALUES (?, ?, ?, 'public', 'customer', ?, ?, ?)
				""")
			.params(UUID.randomUUID(), this.acme, ticket.id(), this.mariaCustomer, body, Timestamp.from(NOW.minus(ago)))
			.update();
	}

	// --- Lectura -------------------------------------------------------------------------------------------------

	/** Consulta a la hora {@link #NOW}; comprueba el contrato de la respuesta. */
	private JsonNode attention(String asUser, String scope, String size) throws Exception {
		this.clock.set(NOW);
		MockHttpServletRequestBuilder request = get(API + "/tickets/attention").queryParam("scope", scope).with(as(asUser));
		if (size != null) {
			request = request.queryParam("size", size);
		}
		MvcResult result = this.mvc.perform(request)
			.andExpect(status().isOk())
			.andExpect(matchesContract("listTicketsNeedingAttention"))
			.andReturn();
		return JSON.readTree(result.getResponse().getContentAsString());
	}

	private static List<Long> numbers(JsonNode result) {
		List<Long> numbers = new ArrayList<>();
		result.path("items").forEach((item) -> numbers.add(item.at("/ticket/number").asLong()));
		return numbers;
	}

	private static List<String> kinds(JsonNode result) {
		List<String> kinds = new ArrayList<>();
		result.path("items").forEach((item) -> kinds.add(item.at("/reason/kind").asString()));
		return kinds;
	}

	private static Instant since(JsonNode result, int index) {
		return Instant.parse(result.at("/items/" + index + "/reason/since").asString());
	}

}
