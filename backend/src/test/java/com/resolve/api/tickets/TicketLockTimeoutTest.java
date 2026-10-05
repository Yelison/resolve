package com.resolve.api.tickets;

import java.time.Duration;
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
				.perform(patch("/tickets/1").with(as(LAURA))
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
		this.mvc.perform(patch("/tickets/1").with(as(LAURA))
			.contentType(TicketsController.MERGE_PATCH_JSON)
			.header("If-Match", "\"0\"")
			.content("{\"status\": \"in_progress\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.version").value(1));
		this.mvc.perform(get("/tickets/1/activity").with(as(LAURA))).andExpect(jsonPath("$.length()").value(2));
	}

}
