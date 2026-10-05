package com.resolve.api.tickets;

import java.time.Duration;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Seis tickets con distintos estados, prioridades y responsables, creados con un minuto de diferencia. */
class TicketInboxApiTest extends TicketsFixture {

	@BeforeEach
	void seedTickets() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "No puedo acceder a mi cuenta", "urgent", this.laura); // 1
		this.clock.advance(Duration.ofMinutes(1));
		createTicket(LAURA, this.carlosCustomer, "Error al procesar el pago", "high", this.daniel); // 2
		this.clock.advance(Duration.ofMinutes(1));
		createTicket(LAURA, this.anaCustomer, "Cambiar correo de facturación", "medium", null); // 3
		this.clock.advance(Duration.ofMinutes(1));
		createTicket(LAURA, this.carlosCustomer, "Consulta sobre el plan Pro", "low", this.laura); // 4
		this.clock.advance(Duration.ofMinutes(1));
		createTicket(LAURA, this.anaCustomer, "Integración con Slack 100%", "medium", null); // 5
		this.clock.advance(Duration.ofMinutes(1));
		createTicket(LAURA, this.mariaCustomer, "Factura duplicada", "high", this.laura); // 6
		this.clock.advance(Duration.ofMinutes(1));
		patchTicket(LAURA, 4, 0, "{\"status\": \"resolved\"}");
		createTicket(NORTHWIND_AGENT, this.northwindCustomer, "Ticket de otra organización", "urgent", null);
	}

	@Test
	void listsByLastActivityWithTheNewestFirst() throws Exception {
		this.mvc.perform(get("/tickets").with(as(ADMIN)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listTickets"))
			.andExpect(jsonPath("$.items[*].number", contains(4, 6, 5, 3, 2, 1)))
			.andExpect(jsonPath("$.totalItems").value(6))
			.andExpect(jsonPath("$.items[0].assignee.name").value("Laura Méndez"))
			.andExpect(jsonPath("$.items[0].assignee.email").doesNotExist());
	}

	@Test
	void viewsSplitMineUnassignedAndResolved() throws Exception {
		this.mvc.perform(get("/tickets").param("view", "mine").with(as(LAURA)))
			.andExpect(jsonPath("$.items[*].number", contains(6, 1)));
		this.mvc.perform(get("/tickets").param("view", "unassigned").with(as(LAURA)))
			.andExpect(jsonPath("$.items[*].number", contains(5, 3)));
		this.mvc.perform(get("/tickets").param("view", "resolved").with(as(LAURA)))
			.andExpect(jsonPath("$.items[*].number", contains(4)));
		this.mvc.perform(get("/tickets").param("view", "resolved").param("status", "open").with(as(LAURA)))
			.andExpect(jsonPath("$.totalItems").value(0));
	}

	@Test
	void combinesFiltersWithAndAndRepeatedValuesWithOr() throws Exception {
		this.mvc.perform(get("/tickets").param("priority", "high").param("priority", "urgent").with(as(ADMIN)))
			.andExpect(jsonPath("$.items[*].number", contains(6, 2, 1)));
		this.mvc.perform(get("/tickets").param("priority", "high").param("assigneeId", this.laura.toString())
			.with(as(ADMIN))).andExpect(jsonPath("$.items[*].number", contains(6)));
		this.mvc.perform(get("/tickets").param("assigneeId", "none").with(as(ADMIN)))
			.andExpect(jsonPath("$.items[*].number", contains(5, 3)));
	}

	@Test
	void searchesTextLiterallyAndNumbersExactly() throws Exception {
		this.mvc.perform(get("/tickets").param("q", "northstar").with(as(ADMIN)))
			.andExpect(jsonPath("$.items[*].number", containsInAnyOrder(4, 2)));
		this.mvc.perform(get("/tickets").param("q", "100%").with(as(ADMIN)))
			.andExpect(jsonPath("$.items[*].number", contains(5)));
		this.mvc.perform(get("/tickets").param("q", "#2").with(as(ADMIN)))
			.andExpect(jsonPath("$.items[*].number", contains(2)));
		this.mvc.perform(get("/tickets").param("q", "otra organización").with(as(ADMIN)))
			.andExpect(jsonPath("$.totalItems").value(0));
	}

	@Test
	void filtersByCustomerWithinTheOrganization() throws Exception {
		this.mvc.perform(get("/tickets").param("customerId", this.carlosCustomer.toString()).with(as(ADMIN)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listTickets"))
			.andExpect(jsonPath("$.items[*].number", contains(4, 2)))
			.andExpect(jsonPath("$.totalItems").value(2));
		this.mvc
			.perform(get("/tickets").param("customerId", this.carlosCustomer.toString())
				.param("status", "resolved")
				.with(as(ADMIN)))
			.andExpect(jsonPath("$.items[*].number", contains(4)));
		// Un cliente de otra organización y un id inexistente se tratan igual: página vacía, sin 400 ni 404.
		for (UUID unreachable : new UUID[] { this.northwindCustomer, UUID.randomUUID() }) {
			this.mvc.perform(get("/tickets").param("customerId", unreachable.toString()).with(as(ADMIN)))
				.andExpect(status().isOk())
				.andExpect(matchesContract("listTickets"))
				.andExpect(jsonPath("$.totalItems").value(0))
				.andExpect(jsonPath("$.items").isEmpty());
		}
		// Un valor vacío equivale a no filtrar.
		this.mvc.perform(get("/tickets").param("customerId", "").with(as(ADMIN)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listTickets"))
			.andExpect(jsonPath("$.totalItems").value(6));
		this.mvc.perform(get("/tickets").param("customerId", "no-es-un-uuid").with(as(ADMIN)))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("listTickets"))
			.andExpect(jsonPath("$.errors[*].field", contains("customerId")));
	}

	@Test
	void aCustomerMemberCannotWidenTheScopeWithCustomerId() throws Exception {
		this.mvc.perform(get("/tickets").param("customerId", this.carlosCustomer.toString()).with(as(MARIA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listTickets"))
			.andExpect(jsonPath("$.totalItems").value(0))
			.andExpect(jsonPath("$.items").isEmpty());
		this.mvc.perform(get("/tickets").param("customerId", this.mariaCustomer.toString()).with(as(MARIA)))
			.andExpect(jsonPath("$.items[*].number", contains(6, 1)));
	}

	@Test
	void sortsPriorityAndStatusByRankWithAStableTieBreaker() throws Exception {
		this.mvc.perform(get("/tickets").param("sort", "priority,desc").with(as(ADMIN)))
			.andExpect(jsonPath("$.items[*].number", contains(1, 6, 2, 5, 3, 4)));
		this.mvc.perform(get("/tickets").param("sort", "status,desc").with(as(ADMIN)))
			.andExpect(jsonPath("$.items[0].number").value(4));
	}

	@Test
	void paginatesWithoutGapsOrRepeats() throws Exception {
		this.mvc.perform(get("/tickets").param("sort", "priority,desc").param("size", "4").with(as(ADMIN)))
			.andExpect(matchesContract("listTickets"))
			.andExpect(jsonPath("$.items[*].number", contains(1, 6, 2, 5)))
			.andExpect(jsonPath("$.totalPages").value(2));
		this.mvc
			.perform(get("/tickets").param("sort", "priority,desc").param("size", "4").param("page", "1").with(as(ADMIN)))
			.andExpect(jsonPath("$.items[*].number", contains(3, 4)));
	}

	@Test
	void rejectsUnknownFilterValuesAndSortFields() throws Exception {
		this.mvc.perform(get("/tickets").param("status", "closed").param("view", "todos").param("sort", "subject,asc")
			.param("assigneeId", "laura").with(as(ADMIN)))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("listTickets"))
			.andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("sort", "view", "status", "assigneeId")));
	}

}
