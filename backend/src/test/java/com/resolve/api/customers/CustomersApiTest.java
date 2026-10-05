package com.resolve.api.customers;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CustomersApiTest extends ApiIntegrationTest {

	private UUID acme;

	@BeforeEach
	void seed() {
		UUID acme = this.data.organization("Acme Studio");
		this.acme = acme;
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
		this.mvc.perform(get(API + "/customers").with(as("laura@acme.example")))
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
		this.mvc.perform(get(API + "/customers").param("q", "NORTHSTAR").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[*].name", contains("Carlos Ruiz", "Elena Díaz")));
	}

	@Test
	void treatsWildcardsLiterally() throws Exception {
		this.mvc.perform(get(API + "/customers").param("q", "100%").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[*].name", contains("Promo 100% Real")));
		this.mvc.perform(get(API + "/customers").param("q", "_").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.totalItems").value(0));
	}

	@Test
	void paginatesWithAStableOrderAndAcceptsPagesPastTheEnd() throws Exception {
		this.mvc.perform(get(API + "/customers").param("size", "2").param("page", "1").param("sort", "name,desc")
			.with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.items[*].name", contains("Elena Díaz", "Carlos Ruiz")))
			.andExpect(jsonPath("$.totalPages").value(3));
		this.mvc.perform(get(API + "/customers").param("page", "9").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items").isEmpty());
	}

	@Test
	void rejectsInvalidPaginationAndSorting() throws Exception {
		this.mvc.perform(get(API + "/customers").param("size", "101").param("page", "-1").param("sort", "email,asc")
			.with(as("laura@acme.example")))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.errors[*].field", contains("page", "size", "sort")));
	}

	@Test
	void rejectsPagesWhoseOffsetWouldOverflow() throws Exception {
		this.mvc.perform(get(API + "/customers").param("page", "2147483647").with(as("laura@acme.example")))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.errors[0].field").value("page"));
	}

	@Test
	void customersCannotSearchCustomers() throws Exception {
		this.mvc.perform(get(API + "/customers").with(as("elena@northstar.example")))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("listCustomers"));
	}

	@Test
	void theSearchNeverIncludesOtherOrganizations() throws Exception {
		this.mvc.perform(get(API + "/customers").param("q", "ajeno").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.totalItems").value(0));
		this.mvc.perform(get(API + "/customers").with(as("laura@acme.example")))
			.andExpect(jsonPath("$.items[*].company", hasItem("Northstar")));
	}

	@Test
	void listsCustomersWithTicketCountsAndHidesArchivedByDefault() throws Exception {
		UUID maria = customerId("maria@cliente.example");
		UUID archived = this.data.customer(this.acme, "Zoe Archivada", "zoe@example.com", "Orbit Labs");
		this.data.ticket(this.acme, maria, 1, "open");
		this.data.ticket(this.acme, maria, 2, "waiting");
		this.data.ticket(this.acme, maria, 3, "resolved");
		this.data.ticket(this.acme, archived, 4, "open");
		this.data.archiveCustomer(archived, Instant.parse("2026-10-01T10:00:00Z"));

		this.mvc.perform(get(API + "/customers").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.totalItems").value(5))
			.andExpect(jsonPath("$.items[*].name", not(hasItem("Zoe Archivada"))))
			.andExpect(jsonPath("$.items[?(@.name == 'maría Pérez')].openTickets").value(2))
			.andExpect(jsonPath("$.items[?(@.name == 'maría Pérez')].totalTickets").value(3))
			.andExpect(jsonPath("$.items[?(@.name == 'Ana García')].totalTickets").value(0))
			.andExpect(jsonPath("$.items[*].archived", everyItem(is(false))));
	}

	@Test
	void archivedTrueListsOnlyArchivedCustomersWithTheirCounts() throws Exception {
		UUID archived = this.data.customer(this.acme, "Zoe Archivada", "zoe@example.com", "Orbit Labs");
		this.data.ticket(this.acme, archived, 4, "open");
		this.data.archiveCustomer(archived, Instant.parse("2026-10-01T10:00:00Z"));

		this.mvc.perform(get(API + "/customers").param("archived", "true").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.items[*].name", contains("Zoe Archivada")))
			.andExpect(jsonPath("$.items[0].archived").value(true))
			.andExpect(jsonPath("$.items[0].openTickets").value(1));
		this.mvc.perform(get(API + "/customers").param("archived", "false").with(as("laura@acme.example")))
			.andExpect(jsonPath("$.totalItems").value(5));
	}

	@Test
	void rejectsAnArchivedValueThatIsNotABoolean() throws Exception {
		this.mvc.perform(get(API + "/customers").param("archived", "maybe").with(as("laura@acme.example")))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.errors[0].field").value("archived"));
	}

	@Test
	void filtersByCompanyCaseInsensitively() throws Exception {
		this.mvc.perform(get(API + "/customers").param("company", "nOrThStAr").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[*].name", contains("Carlos Ruiz", "Elena Díaz")));
		// La empresa es una igualdad, no una búsqueda: un fragmento no coincide.
		this.mvc.perform(get(API + "/customers").param("company", "North").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.totalItems").value(0));
		// Y la de otra organización no se ve aunque exista allí.
		this.mvc.perform(get(API + "/customers").param("company", "Northwind").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items").isEmpty());
	}

	@Test
	void sortsByOpenTicketsWithStableTies() throws Exception {
		UUID carlos = customerId("carlos@northstar.example");
		UUID ana = customerId("ana@orbit.example");
		this.data.ticket(this.acme, carlos, 1, "open");
		this.data.ticket(this.acme, carlos, 2, "in_progress");
		this.data.ticket(this.acme, ana, 3, "open");
		this.data.ticket(this.acme, ana, 4, "resolved");

		// Carlos (2) primero; Ana (1) después; los tres sin tickets abiertos empatan y salen por id ascendente.
		List<String> tied = List.of(customerId("maria@cliente.example"), customerId("promo@example.com"),
				customerId("elena@northstar.example")).stream().map(UUID::toString).sorted().toList();
		this.mvc.perform(get(API + "/customers").param("sort", "openTickets,desc").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listCustomers"))
			.andExpect(jsonPath("$.items[0].name").value("Carlos Ruiz"))
			.andExpect(jsonPath("$.items[1].name").value("Ana García"))
			.andExpect(jsonPath("$.items[2:5].id", contains(tied.toArray())));
		this.mvc.perform(get(API + "/customers").param("sort", "openTickets,asc").with(as("laura@acme.example")))
			.andExpect(jsonPath("$.items[0:3].id", contains(tied.toArray())))
			.andExpect(jsonPath("$.items[3].name").value("Ana García"))
			.andExpect(jsonPath("$.items[4].name").value("Carlos Ruiz"));
	}

	@Test
	void sortsByCreationDate() throws Exception {
		UUID oldest = this.data.customer(this.acme, "Zeta Antigua", "zeta@example.com", null,
				Instant.parse("2020-01-01T00:00:00Z"));
		this.mvc.perform(get(API + "/customers").param("sort", "createdAt,asc").param("size", "1")
			.with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].id").value(oldest.toString()));
		this.mvc.perform(get(API + "/customers").param("sort", "createdAt,desc").param("size", "1")
			.with(as("laura@acme.example")))
			.andExpect(jsonPath("$.items[0].id").value(not(oldest.toString())));
	}

	@Test
	void aCustomerMemberGets403OnEveryCustomerEndpoint() throws Exception {
		UUID id = customerId("carlos@northstar.example");
		String elena = "elena@northstar.example";
		this.mvc.perform(get(API + "/customers").with(as(elena)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("listCustomers"));
		this.mvc.perform(post(API + "/customers").with(as(elena))
			.contentType("application/json")
			.content("{\"name\": \"Nuevo\", \"email\": \"nuevo@example.com\"}"))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("createCustomer"));
		this.mvc.perform(get(API + "/customers/" + id).with(as(elena)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("getCustomer"));
		this.mvc.perform(patch(API + "/customers/" + id).with(as(elena))
			.header("If-Match", "\"0\"")
			.contentType("application/merge-patch+json")
			.content("{\"name\": \"Otro\"}"))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("updateCustomer"));
		this.mvc.perform(post(API + "/customers/" + id + "/archive").with(as(elena)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("archiveCustomer"));
		this.mvc.perform(post(API + "/customers/" + id + "/restore").with(as(elena)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("restoreCustomer"));
		this.mvc.perform(get(API + "/customers/metrics").with(as(elena)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("getCustomerMetrics"));
		this.mvc.perform(get(API + "/customers/companies").with(as(elena)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("listCompanies"));
	}

	private UUID customerId(String email) {
		return this.data.customerIdByEmail(this.acme, email);
	}

	@Test
	void controlCharactersInTheFiltersAreFieldErrors() throws Exception {
		for (String filter : new String[] { "q", "company" }) {
			// En el medio, al final y solo: recortar el texto no puede esconderlos.
			for (String value : new String[] { "a\u0000b", "a\u0000", "\u0000", "a\tb", "a\u001fb" }) {
				this.mvc.perform(get(API + "/customers").param(filter, value).with(as("laura@acme.example")))
					.andExpect(status().isBadRequest())
					.andExpect(matchesContract("listCustomers"))
					.andExpect(jsonPath("$.errors[*].field", contains(filter)))
					.andExpect(jsonPath("$.errors[0].message").value("No admite caracteres de control."));
			}
		}
	}

}
