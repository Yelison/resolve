package com.resolve.api.tickets;

import java.time.Duration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TicketMessagesApiTest extends TicketsFixture {

	@Autowired
	private JdbcClient jdbc;

	@BeforeEach
	void seedConversation() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "No puedo acceder a mi cuenta", "urgent", this.laura);
		this.clock.advance(Duration.ofMinutes(12));
		reply(LAURA, "Ya te envié un nuevo enlace de acceso.", "public").andExpect(status().isCreated());
		this.clock.advance(Duration.ofMinutes(1));
		reply(LAURA, "Verificación completada. Sin bloqueos activos.", "internal").andExpect(status().isCreated());
	}

	private org.springframework.test.web.servlet.ResultActions reply(String user, String body, String visibility)
			throws Exception {
		return this.mvc.perform(post("/tickets/1/messages").with(as(user)).contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\": \"%s\", \"visibility\": \"%s\"}".formatted(body, visibility)));
	}

	@Test
	void staffReadThePublicConversationAndInternalNotes() throws Exception {
		this.mvc.perform(get("/tickets/1/messages").with(as(DANIEL)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listMessages"))
			.andExpect(jsonPath("$[*].visibility", contains("public", "internal")))
			.andExpect(jsonPath("$[0].author.name").value("Laura Méndez"))
			.andExpect(jsonPath("$[0].author.kind").value("agent"));
	}

	@Test
	void customersNeverReceiveInternalNotes() throws Exception {
		this.mvc.perform(get("/tickets/1/messages").with(as(MARIA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listMessages"))
			.andExpect(jsonPath("$[*].visibility", contains("public")))
			.andExpect(jsonPath("$[*].body", contains("Ya te envié un nuevo enlace de acceso.")));
	}

	@Test
	void publicRepliesMoveUpdatedAtButInternalNotesDoNot() throws Exception {
		// Creado a las 15:00, respuesta pública a las 15:12, nota interna a las 15:13.
		this.mvc.perform(get("/tickets/1").with(as(MARIA)))
			.andExpect(jsonPath("$.updatedAt").value("2026-10-04T15:12:00Z"));
	}

	@Test
	void messagesNeverChangeTheTicketVersion() throws Exception {
		this.mvc.perform(get("/tickets/1").with(as(LAURA)))
			.andExpect(header().string("ETag", "\"0\""))
			.andExpect(jsonPath("$.version").value(0));
	}

	@Test
	void aPublicReplyMovesUpdatedAtWithoutBumpingTheVersion() throws Exception {
		// La conversación sembrada ya movió updatedAt a las 15:12; esta respuesta lo mueve a un sello distinto.
		this.clock.advance(Duration.ofMinutes(5));
		reply(DANIEL, "¿Pudiste acceder?", "public").andExpect(status().isCreated());

		this.mvc.perform(get("/tickets/1").with(as(LAURA)))
			.andExpect(header().string("ETag", "\"0\""))
			.andExpect(jsonPath("$.version").value(0))
			.andExpect(jsonPath("$.updatedAt").value("2026-10-04T15:18:00Z"));
		// La versión que el cliente tenía antes de la respuesta sigue siendo válida.
		this.mvc.perform(patch("/tickets/1").with(as(DANIEL)).contentType(TicketsController.MERGE_PATCH_JSON)
			.header("If-Match", "\"0\"")
			.content("{\"status\": \"in_progress\"}"))
			.andExpect(status().isOk())
			.andExpect(matchesContract("updateTicket"))
			.andExpect(header().string("ETag", "\"1\""))
			.andExpect(jsonPath("$.updatedAt").value("2026-10-04T15:18:00Z"));
	}

	@Test
	void anInternalNoteLeavesTheTicketRowUntouched() throws Exception {
		Object before = ticketRow();
		this.clock.advance(Duration.ofMinutes(5));
		reply(DANIEL, "Nota para el equipo.", "internal").andExpect(status().isCreated());

		assertThat(ticketRow()).isEqualTo(before);
	}

	private Object ticketRow() {
		return this.jdbc.sql("select updated_at, version, first_response_at from tickets where number = 1")
			.query()
			.singleRow();
	}

	@Test
	void createsAMessageAccordingToTheContract() throws Exception {
		reply(DANIEL, "¿Pudiste acceder?", "public")
			.andExpect(status().isCreated())
			.andExpect(matchesContract("createMessage"))
			.andExpect(jsonPath("$.author.name").value("Daniel Santos"))
			.andExpect(jsonPath("$.createdAt").value("2026-10-04T15:13:00Z"));
	}

	@Test
	void requiresBodyAndAnExplicitVisibility() throws Exception {
		this.mvc.perform(post("/tickets/1/messages").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\": \"   \"}"))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createMessage"))
			.andExpect(jsonPath("$.errors[*].field", contains("body", "visibility")));
		reply(LAURA, "Hola", "private").andExpect(status().isBadRequest());
	}

	@Test
	void customersCannotPostMessages() throws Exception {
		reply(MARIA, "Gracias", "public").andExpect(status().isForbidden()).andExpect(matchesContract("createMessage"));
	}

}
