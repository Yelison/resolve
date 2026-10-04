package com.resolve.api.customers;

import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CustomersApiTest extends ApiIntegrationTest {

	@BeforeEach
	void seed() {
		UUID acme = this.data.organization("Acme Studio");
		this.data.staff(acme, "agent", "Laura Méndez", "laura@acme.example");
		this.data.customer(acme, "maría Pérez", "maria@cliente.example", "Acme Studio");
		this.data.customer(acme, "Carlos Ruiz", "carlos@northstar.example", "Northstar");
		this.data.customer(acme, "Ana García", "ana@orbit.example", "Orbit Labs");
		this.data.customer(acme, "Promo 100% Real", "promo@example.com", null);
		UUID customerId = this.data.customer(acme, "Elena Díaz", "elena@northstar.example", "Northstar");
		this.data.customerUser(acme, customerId, "Elena Díaz", "elena@northstar.example");
		UUID other = this.data.organization("Northwind");
		this.data.customer(other, "Cliente Ajeno", "ajeno@northwind.example", "Northwind");
	}

	@Test
	void listsOnlyTheOrganizationCustomersSortedByNameCaseInsensitively() throws Exception {
		this.mvc.perform(get("/customers").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.items[*].name",
					contains("Ana García", "Carlos Ruiz", "Elena Díaz", "maría Pérez", "Promo 100% Real")))
			.andExpect(jsonPath("$.totalItems").value(5))
			.andExpect(jsonPath("$.page").value(0))
			.andExpect(jsonPath("$.size").value(20));
	}

	@Test
	void searchesNameEmailAndCompany() throws Exception {
		this.mvc.perform(get("/customers").param("q", "NORTHSTAR").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[*].name", contains("Carlos Ruiz", "Elena Díaz")));
	}

	@Test
	void treatsWildcardsLiterally() throws Exception {
		this.mvc.perform(get("/customers").param("q", "100%").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[*].name", contains("Promo 100% Real")));
		this.mvc.perform(get("/customers").param("q", "_").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.totalItems").value(0));
	}

	@Test
	void paginatesWithAStableOrderAndAcceptsPagesPastTheEnd() throws Exception {
		this.mvc.perform(get("/customers").param("size", "2").param("page", "1").param("sort", "name,desc")
			.with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.items[*].name", contains("Elena Díaz", "Carlos Ruiz")))
			.andExpect(jsonPath("$.totalPages").value(3));
		this.mvc.perform(get("/customers").param("page", "9").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items").isEmpty());
	}

	@Test
	void rejectsInvalidPaginationAndSorting() throws Exception {
		this.mvc.perform(get("/customers").param("size", "101").param("page", "-1").param("sort", "email,asc")
			.with(as("laura@acme.example")))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.errors[*].field", contains("page", "size", "sort")));
	}

	@Test
	void rejectsPagesWhoseOffsetWouldOverflow() throws Exception {
		this.mvc.perform(get("/customers").param("page", "2147483647").with(as("laura@acme.example")))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.errors[0].field").value("page"));
	}

	@Test
	void customersCannotSearchCustomers() throws Exception {
		this.mvc.perform(get("/customers").with(as("elena@northstar.example")))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("listCustomers"));
	}

	@Test
	void theSearchNeverIncludesOtherOrganizations() throws Exception {
		this.mvc.perform(get("/customers").param("q", "ajeno").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.totalItems").value(0));
		this.mvc.perform(get("/customers").with(as("laura@acme.example")))
			.andExpect(jsonPath("$.items[*].company", hasItem("Northstar")));
	}

}
