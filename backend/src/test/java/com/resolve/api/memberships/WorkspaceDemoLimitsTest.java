package com.resolve.api.memberships;

import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Los topes de la demostración actúan por organización ({@code DemoLimits}), así que un espacio creado por la API
 * arranca con los suyos aunque la organización de origen ya los haya gastado.
 */
@TestPropertySource(properties = { "resolve.demo.limits=true", "resolve.demo.cap.tickets=2",
		"resolve.demo.cap.customers=2" })
class WorkspaceDemoLimitsTest extends ApiIntegrationTest {

	private static final String ADMIN = "admin@acme.example";

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private UUID acmeCustomer;

	@BeforeEach
	void seed() {
		UUID acme = this.data.organization("Acme");
		this.data.staff(acme, "admin", "Yelisson Ortiz", ADMIN);
		this.acmeCustomer = this.data.customer(acme, "Cliente 1", "uno@cliente.example", "Cliente");
		this.data.customer(acme, "Cliente 2", "dos@cliente.example", "Cliente");
		this.data.ticket(acme, this.acmeCustomer, 1, "open");
		this.data.ticket(acme, this.acmeCustomer, 2, "open");
	}

	private ResultActions createCustomer(MockHttpSession session, String email) throws Exception {
		return this.mvc.perform(post(API + "/customers").session(session)
			.with(as(ADMIN))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Nuevo\", \"email\": \"%s\"}".formatted(email)));
	}

	private ResultActions createTicket(MockHttpSession session, String customerId) throws Exception {
		return this.mvc.perform(post(API + "/tickets").session(session)
			.with(as(ADMIN))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"customerId\": \"%s\", \"subject\": \"Asunto\", \"description\": \"Texto\"}".formatted(customerId)));
	}

	@Test
	void aNewWorkspaceStartsWithItsOwnCapsWhileTheOneItCameFromIsFull() throws Exception {
		// Acme ya está en el tope de tickets y de clientes.
		createCustomer(new MockHttpSession(), "tres@cliente.example").andExpect(status().isConflict())
			.andExpect(jsonPath("$.title").value("Límite de la demostración"));
		MockHttpSession session = new MockHttpSession();
		this.mvc.perform(post(API + "/organizations").session(session)
			.with(as(ADMIN))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Nuevo espacio\", \"timeZone\": \"America/Bogota\"}")).andExpect(status().isCreated());

		// En el espacio nuevo caben dos clientes y dos tickets, y el tercero de cada uno topa con su tope.
		String first = idOf(createCustomer(session, "a@nuevo.example").andExpect(status().isCreated()));
		createCustomer(session, "b@nuevo.example").andExpect(status().isCreated());
		createCustomer(session, "c@nuevo.example").andExpect(status().isConflict())
			.andExpect(jsonPath("$.title").value("Límite de la demostración"));
		createTicket(session, first).andExpect(status().isCreated());
		createTicket(session, first).andExpect(status().isCreated());
		createTicket(session, first).andExpect(status().isConflict())
			.andExpect(jsonPath("$.title").value("Límite de la demostración"));
		// Y lo de Acme sigue en su tope: los números de los dos espacios no se mezclan.
		createCustomer(new MockHttpSession(), "cuatro@cliente.example").andExpect(status().isConflict());
	}

	private static String idOf(ResultActions result) throws Exception {
		String id = JSON.readTree(result.andReturn().getResponse().getContentAsString()).path("id").asString();
		assertThat(id).isNotBlank();
		return id;
	}

}
