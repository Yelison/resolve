package com.resolve.api.common.web;

import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Los topes por organización de la demostración: con uno de dos huecos libres el alta cabe y la siguiente es un 409
 * «Límite de la demostración»; la otra organización no se ve afectada. Los topes se bajan a dos con propiedades para
 * no sembrar 500 filas.
 */
@TestPropertySource(properties = { "resolve.demo.limits=true", "resolve.demo.cap.tickets=2",
		"resolve.demo.cap.customers=2", "resolve.demo.cap.members=2", "resolve.demo.cap.articles=2" })
class DemoLimitsTest extends ApiIntegrationTest {

	private static final String ANA = "ana@acme.example";

	private static final String BEA = "bea@northwind.example";

	@Autowired
	private DemoLimits limits;

	private UUID acme;

	private UUID northwind;

	private UUID acmeCustomer;

	private UUID northwindCustomer;

	private UUID acmeCategory;

	private UUID northwindCategory;

	@BeforeEach
	void seed() {
		this.acme = this.data.organization("Acme");
		this.northwind = this.data.organization("Northwind");
		UUID ana = this.data.staff(this.acme, "admin", "Ana", ANA);
		this.data.staff(this.northwind, "admin", "Bea", BEA);
		this.acmeCustomer = this.data.customer(this.acme, "Cliente A", "a@cliente.example", "A");
		this.northwindCustomer = this.data.customer(this.northwind, "Cliente N", "n@cliente.example", "N");
		this.acmeCategory = this.data.category(this.acme, "General", "general");
		this.northwindCategory = this.data.category(this.northwind, "General", "general");
		this.data.article(this.acme, this.acmeCategory, "uno", "Uno", "Texto", "draft", "internal", ana,
				java.time.Instant.parse("2026-10-01T10:00:00Z"));
	}

	private ResultActions createTicket(String as, UUID customer) throws Exception {
		return this.mvc.perform(post(API + "/tickets").with(as(as))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"customerId\": \"%s\", \"subject\": \"Asunto\", \"description\": \"Texto\"}".formatted(customer)));
	}

	private ResultActions createCustomer(String as, String email) throws Exception {
		return this.mvc.perform(post(API + "/customers").with(as(as))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Nuevo\", \"email\": \"%s\"}".formatted(email)));
	}

	private ResultActions createArticle(String as, UUID category, String title) throws Exception {
		return this.mvc.perform(post(API + "/knowledge/articles").with(as(as))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"title\": \"%s\", \"body\": \"Texto\", \"categoryId\": \"%s\", \"visibility\": \"internal\"}"
				.formatted(title, category)));
	}

	private ResultActions invite(String as, String email) throws Exception {
		return this.mvc.perform(post(API + "/members").with(as(as))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\": \"%s\", \"role\": \"agent\"}".formatted(email)));
	}

	private static void limitReached(ResultActions result, String what) throws Exception {
		result.andExpect(status().isConflict())
			.andExpect(jsonPath("$.title").value("Límite de la demostración"))
			.andExpect(jsonPath("$.status").value(409))
			.andExpect(jsonPath("$.detail").value(org.hamcrest.Matchers.containsString("2 " + what)));
	}

	@Test
	void ticketsStopAtTheCapAndOnlyInThatOrganization() throws Exception {
		createTicket(ANA, this.acmeCustomer).andExpect(status().isCreated());
		createTicket(ANA, this.acmeCustomer).andExpect(status().isCreated());
		limitReached(createTicket(ANA, this.acmeCustomer), "tickets");
		createTicket(BEA, this.northwindCustomer).andExpect(status().isCreated());
	}

	@Test
	void customersStopAtTheCapArchivedOnesIncluded() throws Exception {
		createCustomer(ANA, "dos@cliente.example").andExpect(status().isCreated());
		limitReached(createCustomer(ANA, "tres@cliente.example"), "clientes");
		createCustomer(BEA, "dos@cliente.example").andExpect(status().isCreated());
	}

	@Test
	void articlesStopAtTheCap() throws Exception {
		createArticle(ANA, this.acmeCategory, "Dos").andExpect(status().isCreated());
		limitReached(createArticle(ANA, this.acmeCategory, "Tres"), "artículos");
		createArticle(BEA, this.northwindCategory, "Dos").andExpect(status().isCreated());
	}

	@Test
	void membersStopAtTheCapAndARemovedMemberDoesNotCount() throws Exception {
		// Ana ya es uno de los dos.
		invite(ANA, "uno@acme.example").andExpect(status().isCreated());
		limitReached(invite(ANA, "dos@acme.example"), "miembros");
		invite(BEA, "uno@northwind.example").andExpect(status().isCreated());
		this.data.staff(this.acme, "agent", "Retirado", "retirado@acme.example", "removed");
		limitReached(invite(ANA, "tres@acme.example"), "miembros");
	}

	@Test
	void theCapsAreThoseOfThePlanUnlessLoweredByProperty() {
		// Aquí están bajados a dos; el valor por defecto lo comprueba DemoLimitsDefaultsTest.
		for (DemoLimits.Resource resource : DemoLimits.Resource.values()) {
			assertThat(this.limits.cap(resource)).isEqualTo(2);
		}
	}

}
