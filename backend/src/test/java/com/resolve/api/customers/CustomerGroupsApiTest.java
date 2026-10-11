package com.resolve.api.customers;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Clientes agrupados por empresa y paginados por empresa: orden de las empresas, totales de todos sus clientes frente a la
 * vista previa de tres, orden dentro de cada una, filtros, último ticket y aislamiento entre organizaciones.
 */
class CustomerGroupsApiTest extends CustomersFixture {

	private static final Instant NOON = Instant.parse("2026-10-01T12:00:00Z");

	private static final String BY_COMPANY = API + "/customers/by-company";

	/** Acme Studio con cinco clientes (uno con otra grafía de la empresa), uno sin empresa y uno con la empresa en blanco. */
	private void manyCustomers() {
		this.data.customer(this.acme, "Bea", "bea@acme.example", "Acme Studio", JOINED.plusSeconds(10));
		this.data.customer(this.acme, "Cora", "cora@acme.example", "acme studio ", JOINED.plusSeconds(20));
		UUID dani = this.data.customer(this.acme, "Dani", "dani@acme.example", "Acme Studio", JOINED.plusSeconds(30));
		this.data.customer(this.acme, "Eli", "eli@acme.example", "Acme Studio", JOINED.plusSeconds(40));
		this.data.customer(this.acme, "Zoe Suelta", "zoe@suelta.example", null, JOINED.plusSeconds(50));
		this.data.customer(this.acme, "Yago Blanco", "yago@blanco.example", "   ", JOINED.plusSeconds(60));
		// Dani, que queda fuera de la vista previa (orden por nombre), tiene un ticket abierto: cuenta en el total.
		this.data.ticket(this.acme, dani, 90, "open");
	}

	@Test
	void listsCompaniesInNameOrderWithTheOnesWithoutCompanyLastAndTotalsOverEveryCustomer() throws Exception {
		manyCustomers();
		this.data.ticket(this.acme, this.mariaCustomer, 91, "waiting");

		this.mvc.perform(get(BY_COMPANY).with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listCustomersByCompany"))
			.andExpect(jsonPath("$.totalItems").value(4))
			.andExpect(jsonPath("$.totalPages").value(1))
			.andExpect(jsonPath("$.items[*].company").value(contains("Acme Studio", "Northstar", "Orbit Labs", null)))
			// Las cinco grafías de Acme son una sola empresa; la vista previa solo trae tres, los totales son de las seis.
			.andExpect(jsonPath("$.items[0].customerCount").value(5))
			.andExpect(jsonPath("$.items[0].openTickets").value(2))
			.andExpect(jsonPath("$.items[0].customers[*].name").value(contains("Bea", "Cora", "Dani")))
			.andExpect(jsonPath("$.items[1].customerCount").value(1))
			.andExpect(jsonPath("$.items[3].customerCount").value(2))
			.andExpect(jsonPath("$.items[3].customers[*].name").value(contains("Yago Blanco", "Zoe Suelta")));
	}

	@Test
	void ordersTheCustomersOfEachCompanyByTheRequestedSortWithoutMovingTheCompanies() throws Exception {
		manyCustomers();

		this.mvc.perform(get(BY_COMPANY).param("sort", "createdAt,desc").with(as(LAURA)))
			.andExpect(matchesContract("listCustomersByCompany"))
			.andExpect(jsonPath("$.items[*].company").value(contains("Acme Studio", "Northstar", "Orbit Labs", null)))
			.andExpect(jsonPath("$.items[0].customers[*].name").value(contains("Eli", "Dani", "Cora")))
			.andExpect(jsonPath("$.items[3].customers[*].name").value(contains("Yago Blanco", "Zoe Suelta")));
		this.mvc.perform(get(BY_COMPANY).param("sort", "openTickets,desc").with(as(LAURA)))
			.andExpect(jsonPath("$.items[0].customers[0].name").value("Dani"));
		this.mvc.perform(get(BY_COMPANY).param("sort", "name,desc").with(as(LAURA)))
			.andExpect(jsonPath("$.items[0].customers[*].name").value(contains("María Pérez", "Eli", "Dani")));
	}

	@Test
	void paginatesByCompanySoNoCompanyIsSplitAcrossPages() throws Exception {
		manyCustomers();

		this.mvc.perform(get(BY_COMPANY).param("size", "2").with(as(LAURA)))
			.andExpect(matchesContract("listCustomersByCompany"))
			.andExpect(jsonPath("$.totalItems").value(4))
			.andExpect(jsonPath("$.totalPages").value(2))
			.andExpect(jsonPath("$.items[*].company").value(contains("Acme Studio", "Northstar")))
			.andExpect(jsonPath("$.items[0].customerCount").value(5));
		this.mvc.perform(get(BY_COMPANY).param("size", "2").param("page", "1").with(as(LAURA)))
			.andExpect(jsonPath("$.items[*].company").value(contains("Orbit Labs", null)))
			.andExpect(jsonPath("$.items[1].customers", hasSize(2)));
		this.mvc.perform(get(BY_COMPANY).param("size", "2").param("page", "7").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items", hasSize(0)))
			.andExpect(jsonPath("$.totalItems").value(4));
	}

	@Test
	void everyPageCarriesItsOwnTotalsAndTheTotalOfCompaniesWhateverThePage() throws Exception {
		UUID zeta1 = this.data.customer(this.acme, "Zeta Uno", "uno@zeta.example", "Zeta", JOINED.plusSeconds(10));
		UUID zeta2 = this.data.customer(this.acme, "Zeta Dos", "dos@zeta.example", "zeta", JOINED.plusSeconds(20));
		this.data.customer(this.acme, "Sin Nada", "nada@suelto.example", null, JOINED.plusSeconds(30));
		this.data.ticket(this.acme, this.mariaCustomer, 81, "open");
		this.data.ticket(this.acme, this.mariaCustomer, 82, "resolved");
		this.data.ticket(this.acme, this.carlosCustomer, 83, "in_progress");
		this.data.ticket(this.acme, this.carlosCustomer, 84, "waiting");
		this.data.ticket(this.acme, this.anaCustomer, 85, "resolved");
		this.data.ticket(this.acme, zeta1, 86, "open");
		this.data.ticket(this.acme, zeta2, 87, "open");
		this.data.ticket(this.acme, zeta2, 88, "open");

		// Cinco empresas (la sin empresa cuenta) de dos en dos: cada página trae sus totales y el mismo total de empresas.
		this.mvc.perform(get(BY_COMPANY).param("size", "2").with(as(LAURA)))
			.andExpect(matchesContract("listCustomersByCompany"))
			.andExpect(jsonPath("$.totalItems").value(5))
			.andExpect(jsonPath("$.totalPages").value(3))
			.andExpect(jsonPath("$.items[*].company").value(contains("Acme Studio", "Northstar")))
			.andExpect(jsonPath("$.items[0].openTickets").value(1))
			.andExpect(jsonPath("$.items[1].openTickets").value(2));
		this.mvc.perform(get(BY_COMPANY).param("size", "2").param("page", "1").with(as(LAURA)))
			.andExpect(jsonPath("$.totalItems").value(5))
			.andExpect(jsonPath("$.items[*].company").value(contains("Orbit Labs", "Zeta")))
			.andExpect(jsonPath("$.items[0].openTickets").value(0))
			.andExpect(jsonPath("$.items[1].customerCount").value(2))
			.andExpect(jsonPath("$.items[1].openTickets").value(3))
			.andExpect(jsonPath("$.items[1].customers[*].name").value(contains("Zeta Dos", "Zeta Uno")));
		this.mvc.perform(get(BY_COMPANY).param("size", "2").param("page", "2").with(as(LAURA)))
			.andExpect(jsonPath("$.totalItems").value(5))
			.andExpect(jsonPath("$.items", hasSize(1)))
			.andExpect(jsonPath("$.items[0].company").value(org.hamcrest.Matchers.nullValue()))
			.andExpect(jsonPath("$.items[0].openTickets").value(0));
		this.mvc.perform(get(BY_COMPANY).param("size", "2").param("page", "9").with(as(LAURA)))
			.andExpect(jsonPath("$.items", hasSize(0)))
			.andExpect(jsonPath("$.totalItems").value(5))
			.andExpect(jsonPath("$.totalPages").value(3));
	}

	@Test
	void theSearchOnlyCountsAndShowsTheMatchingCustomersAndDropsEmptyCompanies() throws Exception {
		manyCustomers();

		this.mvc.perform(get(BY_COMPANY).param("q", "acme.example").with(as(LAURA)))
			.andExpect(matchesContract("listCustomersByCompany"))
			.andExpect(jsonPath("$.totalItems").value(1))
			.andExpect(jsonPath("$.items[0].company").value("Acme Studio"))
			// María no coincide con el correo `acme.example`: quedan los cuatro nuevos.
			.andExpect(jsonPath("$.items[0].customerCount").value(4))
			.andExpect(jsonPath("$.items[0].customers", hasSize(3)));
		this.mvc.perform(get(BY_COMPANY).param("q", "nadie").with(as(LAURA)))
			.andExpect(jsonPath("$.items", hasSize(0)))
			.andExpect(jsonPath("$.totalItems").value(0))
			.andExpect(jsonPath("$.totalPages").value(0));
	}

	@Test
	void archivedTrueGroupsOnlyArchivedCustomers() throws Exception {
		this.data.archiveCustomer(this.anaCustomer, NOON);

		this.mvc.perform(get(BY_COMPANY).param("archived", "true").with(as(LAURA)))
			.andExpect(matchesContract("listCustomersByCompany"))
			.andExpect(jsonPath("$.items", hasSize(1)))
			.andExpect(jsonPath("$.items[0].company").value("Orbit Labs"))
			.andExpect(jsonPath("$.items[0].customers[0].archived").value(true));
		this.mvc.perform(get(BY_COMPANY).with(as(LAURA)))
			.andExpect(jsonPath("$.items[*].company").value(contains("Acme Studio", "Northstar")));
	}

	@Test
	void everyPreviewedCustomerCarriesItsOwnCountsAndLastTicket() throws Exception {
		this.data.ticketWithActivity(this.acme, this.mariaCustomer, 61, "Antiguo", "resolved", NOON.minusSeconds(600));
		this.data.ticketWithActivity(this.acme, this.mariaCustomer, 62, "Reciente", "in_progress", NOON);

		this.mvc.perform(get(BY_COMPANY).with(as(LAURA)))
			.andExpect(matchesContract("listCustomersByCompany"))
			.andExpect(jsonPath("$.items[0].customers[0].lastTicket.number").value(62))
			.andExpect(jsonPath("$.items[0].customers[0].lastTicket.status").value("in_progress"))
			.andExpect(jsonPath("$.items[0].customers[0].openTickets").value(1))
			.andExpect(jsonPath("$.items[0].customers[0].totalTickets").value(2))
			.andExpect(jsonPath("$.items[0].openTickets").value(1))
			.andExpect(jsonPath("$.items[1].customers[0].lastTicket").hasJsonPath())
			.andExpect(jsonPath("$.items[1].customers[0].lastTicket").doesNotExist());
	}

	@Test
	void neverMixesOrganizations() throws Exception {
		// Northwind comparte el nombre de empresa de Acme y tiene el ticket más reciente de toda la base.
		UUID foreign = this.data.customer(this.northwind, "Cliente Ajeno", "ajeno@acme-studio.example", "Acme Studio",
				JOINED);
		this.data.ticketWithActivity(this.northwind, foreign, 70, "Ajeno", "open", NOON.plusSeconds(60));
		this.data.ticketWithActivity(this.acme, this.mariaCustomer, 71, "Propio", "open", NOON.minusSeconds(600));

		this.mvc.perform(get(BY_COMPANY).with(as(LAURA)))
			.andExpect(jsonPath("$.totalItems").value(3))
			.andExpect(jsonPath("$.items[0].company").value("Acme Studio"))
			.andExpect(jsonPath("$.items[0].customerCount").value(1))
			.andExpect(jsonPath("$.items[0].openTickets").value(1))
			.andExpect(jsonPath("$.items[0].customers[*].name").value(contains("María Pérez")))
			.andExpect(jsonPath("$.items[0].customers[0].lastTicket.number").value(71));
		this.mvc.perform(get(BY_COMPANY).with(as(NORTHWIND_AGENT)))
			.andExpect(jsonPath("$.items[*].company").value(contains("Acme Studio", "Soler")))
			.andExpect(jsonPath("$.items[0].customers[0].lastTicket.number").value(70));
	}

	@Test
	void rejectsInvalidPaginationSortAndFilters() throws Exception {
		this.mvc.perform(get(BY_COMPANY).param("size", "0").with(as(LAURA))).andExpect(status().isBadRequest());
		this.mvc.perform(get(BY_COMPANY).param("sort", "company,asc").with(as(LAURA)))
			.andExpect(status().isBadRequest());
		this.mvc.perform(get(BY_COMPANY).param("archived", "quizá").with(as(LAURA)))
			.andExpect(status().isBadRequest());
	}

	@Test
	void withoutCompanyListsOnlyCustomersWithoutOne() throws Exception {
		manyCustomers();

		this.mvc.perform(get(API + "/customers").param("withoutCompany", "true").with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.totalItems").value(2))
			.andExpect(jsonPath("$.items[*].name").value(contains("Yago Blanco", "Zoe Suelta")));
		this.mvc.perform(get(API + "/customers").param("withoutCompany", "false").with(as(LAURA)))
			.andExpect(jsonPath("$.totalItems").value(9));
		this.mvc.perform(get(API + "/customers").param("withoutCompany", "true").param("company", "Acme Studio")
			.with(as(LAURA)))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("listCustomers"));
	}

}
