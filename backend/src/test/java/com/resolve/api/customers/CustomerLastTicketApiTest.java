package com.resolve.api.customers;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** El ticket más reciente de cada cliente en la lista: el de mayor {@code updatedAt}, sin filtrarse entre organizaciones. */
class CustomerLastTicketApiTest extends CustomersFixture {

	private static final Instant NOON = Instant.parse("2026-10-01T12:00:00Z");

	@Test
	void showsTheTicketWithTheLatestActivityNotTheHighestNumberNorTheNewestOne() throws Exception {
		// Orden por número, por creación (un ticket se crea en época en el ayudante) y por actividad: los tres difieren.
		this.data.ticketWithActivity(this.acme, this.mariaCustomer, 10, "Antiguo y resuelto", "resolved", NOON.minusSeconds(3600));
		this.data.ticketWithActivity(this.acme, this.mariaCustomer, 12, "Número alto, poca actividad", "open", NOON.minusSeconds(600));
		this.data.ticketWithActivity(this.acme, this.mariaCustomer, 11, "Actividad más reciente", "waiting", NOON);

		this.mvc.perform(get(API + "/customers").param("q", "maría").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.items", hasSize(1)))
			.andExpect(jsonPath("$.items[0].lastTicket.number").value(11))
			.andExpect(jsonPath("$.items[0].lastTicket.subject").value("Actividad más reciente"))
			.andExpect(jsonPath("$.items[0].lastTicket.status").value("waiting"))
			.andExpect(jsonPath("$.items[0].lastTicket.updatedAt").value("2026-10-01T12:00:00Z"))
			.andExpect(jsonPath("$.items[0].openTickets").value(2))
			.andExpect(jsonPath("$.items[0].totalTickets").value(3));
	}

	@Test
	void breaksATieOnTheLastActivityWithTheHighestNumber() throws Exception {
		this.data.ticketWithActivity(this.acme, this.carlosCustomer, 21, "Empate, número menor", "open", NOON);
		this.data.ticketWithActivity(this.acme, this.carlosCustomer, 22, "Empate, número mayor", "open", NOON);

		this.mvc.perform(get(API + "/customers").param("q", "carlos").with(as(LAURA)))
			.andExpect(jsonPath("$.items[0].lastTicket.number").value(22));
	}

	@Test
	void aCustomerWithoutTicketsHasAnExplicitNull() throws Exception {
		this.mvc.perform(get(API + "/customers").param("q", "ana").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.items[0].lastTicket").hasJsonPath())
			.andExpect(jsonPath("$.items[0].lastTicket").doesNotExist())
			.andExpect(jsonPath("$.items[0].totalTickets").value(0));
	}

	@Test
	void everyCustomerOnThePageGetsItsOwnLastTicketAndInProgressCountsAsOpen() throws Exception {
		this.data.ticketWithActivity(this.acme, this.mariaCustomer, 31, "De María", "open", NOON);
		this.data.ticketWithActivity(this.acme, this.carlosCustomer, 32, "De Carlos", "in_progress", NOON.minusSeconds(60));

		this.mvc.perform(get(API + "/customers").with(as(LAURA)))
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.items[*].name", contains("Ana García", "Carlos Ruiz", "María Pérez")))
			.andExpect(jsonPath("$.items[0].lastTicket").doesNotExist())
			.andExpect(jsonPath("$.items[1].lastTicket.number").value(32))
			.andExpect(jsonPath("$.items[1].lastTicket.status").value("in_progress"))
			.andExpect(jsonPath("$.items[1].openTickets").value(1))
			.andExpect(jsonPath("$.items[2].lastTicket.number").value(31));
	}

	@Test
	void archivedCustomersAlsoCarryTheirLastTicket() throws Exception {
		this.data.ticketWithActivity(this.acme, this.anaCustomer, 41, "Antes de archivar", "resolved", NOON);
		this.data.archiveCustomer(this.anaCustomer, NOON.plusSeconds(60));

		this.mvc.perform(get(API + "/customers").param("archived", "true").with(as(LAURA)))
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.items", hasSize(1)))
			.andExpect(jsonPath("$.items[0].lastTicket.number").value(41))
			.andExpect(jsonPath("$.items[0].openTickets").value(0));
	}

	@Test
	void anotherOrganizationsMoreRecentTicketNeverShowsUp() throws Exception {
		this.data.ticketWithActivity(this.acme, this.mariaCustomer, 51, "Propio", "open", NOON.minusSeconds(3600));
		// Northwind tiene el ticket más reciente de toda la base.
		this.data.ticketWithActivity(this.northwind, this.northwindCustomer, 52, "Ajeno", "open", NOON.plusSeconds(60));

		this.mvc.perform(get(API + "/customers").param("q", "maría").with(as(LAURA)))
			.andExpect(jsonPath("$.items[0].lastTicket.number").value(51))
			.andExpect(jsonPath("$.items[0].lastTicket.subject").value("Propio"));
		this.mvc.perform(get(API + "/customers").with(as(NORTHWIND_AGENT)))
			.andExpect(jsonPath("$.items", hasSize(1)))
			.andExpect(jsonPath("$.items[0].lastTicket.number").value(52));
	}

}
