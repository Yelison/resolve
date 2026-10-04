package com.resolve.api.tickets;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Acme está en America/Bogota (UTC−5): el día local empieza a las 05:00 UTC. */
class TicketMetricsApiTest extends TicketsFixture {

	@Test
	void describesTheWholeOrganizationInItsTimeZone() throws Exception {
		// Ayer en Bogotá (3 de octubre, 23:30 local): creado y resuelto.
		this.clock.set(Instant.parse("2026-10-04T04:30:00Z"));
		createTicket(LAURA, this.mariaCustomer, "Ayer", "low", this.laura); // 1
		patchTicket(LAURA, 1, 0, "{\"status\": \"resolved\"}");

		// Hoy en Bogotá.
		this.clock.set(Instant.parse("2026-10-04T13:00:00Z"));
		createTicket(LAURA, this.mariaCustomer, "Abierto hoy", "high", null); // 2
		createTicket(LAURA, this.carlosCustomer, "En progreso de Laura", "medium", this.laura); // 3
		patchTicket(LAURA, 3, 0, "{\"status\": \"in_progress\"}");
		createTicket(LAURA, this.anaCustomer, "En progreso de Daniel", "medium", this.daniel); // 4
		patchTicket(LAURA, 4, 0, "{\"status\": \"in_progress\"}");
		createTicket(LAURA, this.anaCustomer, "Resuelto hoy", "low", null); // 5
		patchTicket(LAURA, 5, 0, "{\"status\": \"resolved\"}");

		// Primera respuesta pública a los 10 y 20 minutos; la nota interna no cuenta.
		this.clock.advance(Duration.ofMinutes(10));
		reply(2, "public");
		this.clock.advance(Duration.ofMinutes(10));
		reply(3, "public");
		reply(4, "internal");
		createNorthwindTicket();

		this.mvc.perform(get("/tickets/metrics").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getTicketMetrics"))
			.andExpect(jsonPath("$.open").value(1))
			.andExpect(jsonPath("$.openedToday").value(1))
			.andExpect(jsonPath("$.inProgress").value(2))
			.andExpect(jsonPath("$.inProgressAssignedToMe").value(1))
			.andExpect(jsonPath("$.resolvedToday").value(1))
			.andExpect(jsonPath("$.resolvedYesterday").value(1))
			.andExpect(jsonPath("$.firstResponseMinutes").value(15))
			.andExpect(jsonPath("$.firstResponseTargetMinutes").value(30))
			.andExpect(jsonPath("$.views.all").value(5))
			.andExpect(jsonPath("$.views.mine").value(1))
			.andExpect(jsonPath("$.views.unassigned").value(1))
			.andExpect(jsonPath("$.views.resolved").value(2));
	}

	@Test
	void withoutResponsesTheFirstResponseIsNull() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "Sin respuesta", "low", null);
		this.mvc.perform(get("/tickets/metrics").with(as(LAURA)))
			.andExpect(matchesContract("getTicketMetrics"))
			.andExpect(jsonPath("$.firstResponseMinutes").isEmpty());
	}

	private void reply(long number, String visibility) throws Exception {
		this.mvc.perform(post("/tickets/{number}/messages", number).with(as(LAURA)).contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\": \"Respuesta\", \"visibility\": \"%s\"}".formatted(visibility)))
			.andExpect(status().isCreated());
	}

	private void createNorthwindTicket() throws Exception {
		createTicket(NORTHWIND_AGENT, this.northwindCustomer, "No cuenta para Acme", "urgent", null);
	}

}
