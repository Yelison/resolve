package com.resolve.api.tickets;

import java.time.Duration;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TicketMessagesApiTest extends TicketsFixture {

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
