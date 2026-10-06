package com.resolve.api.tickets;

import java.time.Duration;
import java.util.UUID;
import javax.sql.DataSource;

import com.resolve.api.support.RowLock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Otra transacción retiene la fila del ticket: el PATCH espera un tiempo acotado y responde 503, no se cuelga. */
class TicketLockTimeoutTest extends TicketsFixture {

	/** Mucho más que el tope del bloqueo: si el PATCH vuelve a esperar sin límite, el test falla en vez de colgarse. */
	private static final Duration LIMIT = Duration.ofSeconds(20);

	@Autowired
	private DataSource dataSource;

	@Test
	void aRowHeldByAnotherTransactionIsAnExplicit503AndTheRetryWorks() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "Ticket", "urgent", null);

		try (RowLock lock = RowLock.hold(this.dataSource,
				"select id from tickets where organization_id = ? and number = 1 for no key update", this.acme)) {
			ResultActions blocked = assertTimeoutPreemptively(LIMIT, () -> this.mvc
				.perform(patch(API + "/tickets/1").with(as(LAURA))
					.contentType(TicketsController.MERGE_PATCH_JSON)
					.header("If-Match", "\"0\"")
					.content("{\"status\": \"in_progress\"}")));
			blocked.andExpect(status().isServiceUnavailable())
				.andExpect(matchesContract("updateTicket"))
				.andExpect(header().string("Retry-After", "1"))
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.title").value("Recurso ocupado"));
		}

		// Nada cambió: la misma petición, con la fila libre, se aplica.
		this.mvc.perform(patch(API + "/tickets/1").with(as(LAURA))
			.contentType(TicketsController.MERGE_PATCH_JSON)
			.header("If-Match", "\"0\"")
			.content("{\"status\": \"in_progress\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.version").value(1));
		this.mvc.perform(get(API + "/tickets/1/activity").with(as(LAURA))).andExpect(jsonPath("$.length()").value(2));
	}

	@Test
	void assigningToAMemberWhoseRowIsHeldIsA503WithoutChangingTheTicket() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "Ticket", "urgent", null);

		try (RowLock lock = holdMembership(this.laura)) {
			ResultActions blocked = assertTimeoutPreemptively(LIMIT, () -> this.mvc
				.perform(patch(API + "/tickets/1").with(as(ADMIN))
					.contentType(TicketsController.MERGE_PATCH_JSON)
					.header("If-Match", "\"0\"")
					.content("{\"assigneeId\": \"%s\"}".formatted(this.laura))));
			expectLockTimeout(blocked, "updateTicket");
		}

		this.mvc.perform(get(API + "/tickets/1").with(as(ADMIN)))
			.andExpect(jsonPath("$.assignee").doesNotExist())
			.andExpect(jsonPath("$.version").value(0));
		this.mvc.perform(patch(API + "/tickets/1").with(as(ADMIN))
			.contentType(TicketsController.MERGE_PATCH_JSON)
			.header("If-Match", "\"0\"")
			.content("{\"assigneeId\": \"%s\"}".formatted(this.laura)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.assignee.id").value(this.laura.toString()));
	}

	@Test
	void reopeningAResolvedTicketWhoseAssigneeRowIsHeldIsA503AndTheTicketStaysResolved() throws Exception {
		this.data.assignTicket(this.data.ticket(this.acme, this.mariaCustomer, 1, "resolved"), this.laura);

		try (RowLock lock = holdMembership(this.laura)) {
			ResultActions blocked = assertTimeoutPreemptively(LIMIT, () -> this.mvc
				.perform(patch(API + "/tickets/1").with(as(ADMIN))
					.contentType(TicketsController.MERGE_PATCH_JSON)
					.header("If-Match", "\"0\"")
					.content("{\"status\": \"open\"}")));
			expectLockTimeout(blocked, "updateTicket");
		}

		this.mvc.perform(get(API + "/tickets/1").with(as(ADMIN)))
			.andExpect(jsonPath("$.status").value("resolved"))
			.andExpect(jsonPath("$.version").value(0));
	}

	@Test
	void creatingATicketAssignedToAMemberWhoseRowIsHeldIsA503AndCreatesNothing() throws Exception {
		try (RowLock lock = holdMembership(this.laura)) {
			ResultActions blocked = assertTimeoutPreemptively(LIMIT, () -> this.mvc
				.perform(post(API + "/tickets").with(as(ADMIN))
					.contentType(MediaType.APPLICATION_JSON)
					.content("""
							{"customerId": "%s", "subject": "Asunto", "description": "Detalle", "priority": "high",
							 "assigneeId": "%s"}
							""".formatted(this.mariaCustomer, this.laura))));
			expectLockTimeout(blocked, "createTicket");
		}

		this.mvc.perform(get(API + "/tickets/1").with(as(ADMIN))).andExpect(status().isNotFound());
	}

	@Test
	void aPublicReplyWhileTheTicketRowIsHeldIsA503AndStoresNothingWhileAnInternalNoteIsNotBlocked() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "Ticket", "urgent", null);

		try (RowLock lock = RowLock.hold(this.dataSource,
				"select id from tickets where organization_id = ? and number = 1 for no key update", this.acme)) {
			ResultActions blocked = assertTimeoutPreemptively(LIMIT, () -> this.mvc
				.perform(post(API + "/tickets/1/messages").with(as(LAURA))
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"body\": \"Hola\", \"visibility\": \"public\"}")));
			expectLockTimeout(blocked, "createMessage");

			// Una nota interna no toca la fila del ticket: no espera al bloqueo.
			assertTimeoutPreemptively(LIMIT, () -> this.mvc
				.perform(post(API + "/tickets/1/messages").with(as(LAURA))
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"body\": \"Nota\", \"visibility\": \"internal\"}")))
				.andExpect(status().isCreated());
		}

		// La respuesta pública no dejó mensaje ni actividad: solo la nota; con la fila libre se aplica.
		this.mvc.perform(get(API + "/tickets/1/messages").with(as(LAURA)))
			.andExpect(jsonPath("$.length()").value(1))
			.andExpect(jsonPath("$[0].body").value("Nota"));
		this.mvc.perform(post(API + "/tickets/1/messages").with(as(LAURA))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\": \"Hola\", \"visibility\": \"public\"}")).andExpect(status().isCreated());
	}

	private RowLock holdMembership(UUID userId) throws Exception {
		return RowLock.hold(this.dataSource,
				"select id from memberships where organization_id = ? and user_id = ? for no key update", this.acme,
				userId);
	}

	private static void expectLockTimeout(ResultActions blocked, String operationId) throws Exception {
		blocked.andExpect(status().isServiceUnavailable())
			.andExpect(matchesContract(operationId))
			.andExpect(header().string("Retry-After", "1"))
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.title").value("Recurso ocupado"));
	}

}
