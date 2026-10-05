package com.resolve.api.customers;

import java.time.Instant;
import java.util.UUID;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Métricas y empresas: solo clientes activos, por organización y con el mes en la zona de la organización. */
class CustomerMetricsApiTest extends CustomersFixture {

	/** 1 de noviembre de 2026, 00:30 en Bogotá (UTC-5). */
	private static final Instant FIRST_OF_NOVEMBER = Instant.parse("2026-11-01T05:30:00Z");

	@Test
	void metricsCountActiveCustomersCompaniesOpenTicketsAndNewThisMonth() throws Exception {
		this.clock.set(FIRST_OF_NOVEMBER);
		// Alta a las 00:10 locales del 1 de noviembre: cuenta este mes. Su empresa solo difiere en mayúsculas.
		this.data.customer(this.acme, "Alta de noviembre", "nov@example.com", "northstar",
				Instant.parse("2026-11-01T05:10:00Z"));
		// Alta a las 23:30 locales del 31 de octubre: en UTC ya es noviembre, en la organización no.
		UUID october = this.data.customer(this.acme, "Alta de octubre", "oct@example.com", null,
				Instant.parse("2026-11-01T04:30:00Z"));
		// Archivado: no cuenta en nada aunque sea de este mes, tenga empresa propia y un ticket abierto.
		UUID archived = this.data.customer(this.acme, "Archivada", "arch@example.com", "Solo Archivada",
				Instant.parse("2026-11-01T05:20:00Z"));
		this.data.archiveCustomer(archived, Instant.parse("2026-11-01T05:25:00Z"));
		this.data.ticket(this.acme, archived, 1, "open");
		this.data.ticket(this.acme, this.carlosCustomer, 2, "open");
		this.data.ticket(this.acme, this.carlosCustomer, 3, "resolved");
		this.data.ticket(this.acme, this.mariaCustomer, 4, "resolved");
		this.data.ticket(this.acme, october, 5, "in_progress");

		this.mvc.perform(get(API + "/customers/metrics").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getCustomerMetrics"))
			.andExpect(jsonPath("$.total").value(5))
			.andExpect(jsonPath("$.companies").value(3))
			.andExpect(jsonPath("$.withOpenTickets").value(2))
			.andExpect(jsonPath("$.newThisMonth").value(1));

		// Un minuto antes de la medianoche local sigue siendo octubre: el mes que viene no cuenta todavía.
		this.clock.set(Instant.parse("2026-11-01T04:59:00Z"));
		this.mvc.perform(get(API + "/customers/metrics").with(as(LAURA)))
			.andExpect(jsonPath("$.newThisMonth").value(1))
			.andExpect(jsonPath("$.total").value(5));
	}

	@Test
	void metricsUseEachOrganizationsOwnData() throws Exception {
		this.clock.set(FIRST_OF_NOVEMBER);
		// En Madrid (UTC+1) ya es 1 de noviembre a las 00:30 locales.
		this.data.customer(this.northwind, "Alta madrileña", "mad@example.com", "Soler",
				Instant.parse("2026-10-31T23:30:00Z"));
		this.data.ticket(this.northwind, this.northwindCustomer, 1, "waiting");

		this.mvc.perform(get(API + "/customers/metrics").with(as(NORTHWIND_AGENT)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.total").value(2))
			.andExpect(jsonPath("$.companies").value(1))
			.andExpect(jsonPath("$.withOpenTickets").value(1))
			.andExpect(jsonPath("$.newThisMonth").value(1));
		// Acme no ve nada de lo anterior: sus tres clientes, sus empresas y ningún ticket.
		this.mvc.perform(get(API + "/customers/metrics").with(as(ADMIN)))
			.andExpect(jsonPath("$.total").value(3))
			.andExpect(jsonPath("$.companies").value(3))
			.andExpect(jsonPath("$.withOpenTickets").value(0))
			.andExpect(jsonPath("$.newThisMonth").value(0));
	}

	@Test
	void metricsAreZeroForAnOrganizationWithoutCustomers() throws Exception {
		UUID empty = this.data.organization("Vacía");
		this.data.staff(empty, "agent", "Sin Clientes", "sin@vacia.example");
		this.mvc.perform(get(API + "/customers/metrics").with(as("sin@vacia.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.total").value(0))
			.andExpect(jsonPath("$.companies").value(0))
			.andExpect(jsonPath("$.withOpenTickets").value(0))
			.andExpect(jsonPath("$.newThisMonth").value(0));
		this.mvc.perform(get(API + "/customers/companies").with(as("sin@vacia.example")))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listCompanies"))
			.andExpect(jsonPath("$").isEmpty());
	}

	@Test
	void listsDistinctCompaniesAlphabetically() throws Exception {
		this.data.customer(this.acme, "Uno", "uno@example.com", "banana");
		this.data.customer(this.acme, "Dos", "dos@example.com", "Cherry");
		this.data.customer(this.acme, "Tres", "tres@example.com", "northstar");
		this.data.customer(this.acme, "Cuatro", "cuatro@example.com", "Northstar");
		this.data.customer(this.acme, "Cinco", "cinco@example.com", null);
		this.data.customer(this.acme, "Seis", "seis@example.com", "   ");
		UUID archived = this.data.customer(this.acme, "Siete", "siete@example.com", "Solo Archivada");
		this.data.archiveCustomer(archived, Instant.parse("2026-10-01T10:00:00Z"));
		this.data.customer(this.northwind, "Ocho", "ocho@example.com", "Ajena");

		// Sin distinguir mayúsculas («banana» antes que «Cherry»), una vez por nombre y sin vacíos, archivados ni ajenas.
		this.mvc.perform(get(API + "/customers/companies").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listCompanies"))
			.andExpect(jsonPath("$", contains("Acme Studio", "banana", "Cherry", "Northstar", "Orbit Labs")));
	}

	@Test
	void companiesAreCappedAt200() throws Exception {
		IntStream.range(0, 205)
			.forEach((index) -> this.data.customer(this.acme, "Cliente " + index, "c" + index + "@example.com",
					"Empresa %03d".formatted(index)));
		this.mvc.perform(get(API + "/customers/companies").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listCompanies"))
			.andExpect(jsonPath("$", hasSize(200)))
			.andExpect(jsonPath("$[0]").value("Acme Studio"));
	}

	@Test
	void customersCannotReadMetricsOrCompanies() throws Exception {
		this.mvc.perform(get(API + "/customers/metrics").with(as(MARIA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("getCustomerMetrics"));
		this.mvc.perform(get(API + "/customers/companies").with(as(MARIA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("listCompanies"));
	}

}
