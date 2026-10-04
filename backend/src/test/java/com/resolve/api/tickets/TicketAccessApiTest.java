package com.resolve.api.tickets;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Aislamiento entre organizaciones y alcance de los clientes. */
class TicketAccessApiTest extends TicketsFixture {

	@BeforeEach
	void seedTickets() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "Ticket de María", "urgent", this.laura); // Acme #1
		createTicket(LAURA, this.carlosCustomer, "Ticket de Carlos", "high", null); // Acme #2
		createTicket(NORTHWIND_AGENT, this.northwindCustomer, "Ticket de Northwind", "low", null); // Northwind #1
	}

	@Test
	void agentsOnlySeeTheirOrganization() throws Exception {
		this.mvc.perform(get("/tickets").with(as(NORTHWIND_AGENT)))
			.andExpect(jsonPath("$.items[*].subject", contains("Ticket de Northwind")));
		this.mvc.perform(get("/tickets/1").with(as(NORTHWIND_AGENT)))
			.andExpect(jsonPath("$.subject").value("Ticket de Northwind"));
		this.mvc.perform(get("/tickets/2").with(as(NORTHWIND_AGENT)))
			.andExpect(status().isNotFound())
			.andExpect(matchesContract("getTicket"));
		this.mvc.perform(get("/tickets/2/messages").with(as(NORTHWIND_AGENT))).andExpect(status().isNotFound());
		this.mvc.perform(get("/tickets/2/activity").with(as(NORTHWIND_AGENT))).andExpect(status().isNotFound());
	}

	@Test
	void customersOnlySeeTheirOwnTickets() throws Exception {
		this.mvc.perform(get("/tickets").with(as(MARIA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listTickets"))
			.andExpect(jsonPath("$.items[*].subject", contains("Ticket de María")));
		this.mvc.perform(get("/tickets/1").with(as(MARIA))).andExpect(status().isOk()).andExpect(matchesContract("getTicket"));
	}

	@Test
	void anotherCustomersTicketLooksMissing() throws Exception {
		this.mvc.perform(get("/tickets/2").with(as(MARIA))).andExpect(status().isNotFound());
		this.mvc.perform(get("/tickets/2/messages").with(as(MARIA))).andExpect(status().isNotFound());
	}

	@Test
	void customersCannotReadActivityOrMetrics() throws Exception {
		this.mvc.perform(get("/tickets/1/activity").with(as(MARIA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("listActivity"));
		this.mvc.perform(get("/tickets/metrics").with(as(MARIA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("getTicketMetrics"));
	}

	@Test
	void invalidTicketNumbersAreBadRequests() throws Exception {
		this.mvc.perform(get("/tickets/abc").with(as(LAURA)))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("getTicket"));
		this.mvc.perform(get("/tickets/0").with(as(LAURA))).andExpect(status().isBadRequest());
	}

	@Test
	void unauthenticatedCallsAreRejected() throws Exception {
		this.mvc.perform(get("/tickets")).andExpect(status().isUnauthorized()).andExpect(matchesContract("listTickets"));
	}

}
