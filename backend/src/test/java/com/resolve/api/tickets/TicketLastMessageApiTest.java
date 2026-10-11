package com.resolve.api.tickets;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.resolve.api.tickets.TicketDtos.LastMessageDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** `lastMessage` de la bandeja: qué mensaje es el último según quién lee, cómo se resume y cuántas consultas cuesta. */
class TicketLastMessageApiTest extends TicketsFixture {

	@Autowired
	private JdbcClient jdbc;

	@MockitoSpyBean
	private TicketLastMessages lastMessages;

	private UUID withConversation;

	private UUID onlyInternal;

	private UUID withoutMessages;

	@BeforeEach
	void seedTickets() throws Exception {
		this.withConversation = id(createTicket(LAURA, this.mariaCustomer, "No puedo acceder a mi cuenta", "urgent", this.laura));
		this.clock.advance(Duration.ofMinutes(1));
		this.onlyInternal = id(createTicket(LAURA, this.mariaCustomer, "Factura duplicada", "high", this.laura));
		this.clock.advance(Duration.ofMinutes(1));
		this.withoutMessages = id(createTicket(LAURA, this.mariaCustomer, "Cambiar correo de facturación", "low", null));

		this.clock.advance(Duration.ofMinutes(1));
		agentMessage(this.withConversation, this.laura, "public", "Ya te envié un nuevo enlace de acceso.");
		this.clock.advance(Duration.ofMinutes(1));
		customerMessage(this.withConversation, this.mariaCustomer, "Gracias, ya puedo entrar.");
		this.clock.advance(Duration.ofMinutes(1));
		agentMessage(this.withConversation, this.daniel, "internal", "Cuenta desbloqueada; vigilar el acceso.");
		agentMessage(this.onlyInternal, this.laura, "internal", "Revisar con facturación antes de contestar.");
	}

	@Test
	void staffSeeTheNewestMessageEvenWhenItIsAnInternalNote() throws Exception {
		this.mvc.perform(get(API + "/tickets").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listTickets"))
			.andExpect(jsonPath("$.items[?(@.number == 1)].lastMessage.excerpt")
				.value("Cuenta desbloqueada; vigilar el acceso."))
			.andExpect(jsonPath("$.items[?(@.number == 1)].lastMessage.authorName").value("Daniel Santos"))
			.andExpect(jsonPath("$.items[?(@.number == 1)].lastMessage.internal").value(true))
			.andExpect(jsonPath("$.items[?(@.number == 2)].lastMessage.internal").value(true));
	}

	@Test
	void customersNeverSeeAnInternalNoteAsTheLastMessage() throws Exception {
		this.mvc.perform(get(API + "/tickets").with(as(MARIA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listTickets"))
			// El último mensaje visible del #1 es el suyo, no la nota interna posterior.
			.andExpect(jsonPath("$.items[?(@.number == 1)].lastMessage.excerpt").value("Gracias, ya puedo entrar."))
			.andExpect(jsonPath("$.items[?(@.number == 1)].lastMessage.authorName").value("María Pérez"))
			.andExpect(jsonPath("$.items[?(@.number == 1)].lastMessage.internal").value(false))
			// El #2 solo tiene una nota interna: para un cliente no hay mensajes.
			.andExpect(jsonPath("$.items[?(@.number == 2)].lastMessage", contains(nullValue())));
		assertThat(this.mvc.perform(get(API + "/tickets").with(as(MARIA))).andReturn().getResponse().getContentAsString())
			.doesNotContain("vigilar el acceso")
			.doesNotContain("Revisar con facturación");
	}

	@Test
	void aTicketWithoutMessagesHasAnExplicitNullLastMessage() throws Exception {
		this.mvc.perform(get(API + "/tickets").with(as(LAURA)))
			.andExpect(jsonPath("$.items[?(@.number == 3)]").isNotEmpty())
			.andExpect(jsonPath("$.items[2]", hasKey("lastMessage")))
			.andExpect(jsonPath("$.items[?(@.number == 3)].lastMessage", contains(nullValue())));
	}

	@Test
	void theExcerptIsPlainTextOfAtMostOneHundredFortyCharacters() throws Exception {
		agentMessage(this.withoutMessages, this.laura, "public",
				"Hola **María**, mira [esta guía](https://ayuda.example/acceso):\n\n- _restablece_ la contraseña\n- " + "😀".repeat(200));
		this.mvc.perform(get(API + "/tickets").param("q", "#3").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listTickets"))
			.andExpect(jsonPath("$.items[0].lastMessage.excerpt").value(
					org.hamcrest.Matchers.startsWith("Hola María, mira esta guía: restablece la contraseña 😀")))
			.andExpect(jsonPath("$.items[0].lastMessage.excerpt").value(org.hamcrest.Matchers.endsWith("…")));
		JsonNode excerpt = JSON.readTree(this.mvc.perform(get(API + "/tickets").param("q", "#3").with(as(LAURA)))
			.andReturn()
			.getResponse()
			.getContentAsString()).at("/items/0/lastMessage/excerpt");
		assertThat(excerpt.asString().codePointCount(0, excerpt.asString().length())).isEqualTo(140);
	}

	@Test
	void aWholePageCostsOneLastMessageQueryNoMatterHowManyTickets() throws Exception {
		this.mvc.perform(get(API + "/tickets").with(as(LAURA))).andExpect(status().isOk());
		verify(this.lastMessages, times(1)).latest(any(), any(), anyBoolean());
	}

	@Test
	void doesNotReadMessagesOfAnotherOrganization() {
		Map<UUID, LastMessageDto> others = this.lastMessages.latest(this.northwind,
				List.of(this.withConversation, this.onlyInternal), true);
		assertThat(others).isEmpty();
		Map<UUID, LastMessageDto> own = this.lastMessages.latest(this.acme,
				List.of(this.withConversation, this.onlyInternal, this.withoutMessages), true);
		assertThat(own).containsOnlyKeys(this.withConversation, this.onlyInternal);
	}

	private static UUID id(JsonNode ticket) {
		return UUID.fromString(ticket.get("id").asString());
	}

	private void agentMessage(UUID ticket, UUID author, String visibility, String body) {
		this.jdbc.sql("""
				INSERT INTO ticket_messages (id, organization_id, ticket_id, visibility, author_kind, author_user_id, body,
				                             created_at)
				VALUES (?, ?, ?, ?, 'agent', ?, ?, ?)
				""")
			.params(UUID.randomUUID(), this.acme, ticket, visibility, author, body, now())
			.update();
	}

	private void customerMessage(UUID ticket, UUID customer, String body) {
		this.jdbc.sql("""
				INSERT INTO ticket_messages (id, organization_id, ticket_id, visibility, author_kind, author_customer_id,
				                             body, created_at)
				VALUES (?, ?, ?, 'public', 'customer', ?, ?, ?)
				""")
			.params(UUID.randomUUID(), this.acme, ticket, customer, body, now())
			.update();
	}

	private Timestamp now() {
		return Timestamp.from(this.clock.instant());
	}

}
