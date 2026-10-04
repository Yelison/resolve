package com.resolve.api.tickets;

import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Dos organizaciones: Acme (admin, dos agentes, tres clientes y una clienta con acceso) y Northwind (un agente y un
 * cliente), para probar permisos y aislamiento.
 */
abstract class TicketsFixture extends ApiIntegrationTest {

	static final String ADMIN = "admin@acme.example";

	static final String LAURA = "laura@acme.example";

	static final String DANIEL = "daniel@acme.example";

	static final String MARIA = "maria@cliente.example";

	static final String NORTHWIND_AGENT = "agente@northwind.example";

	static final JsonMapper JSON = JsonMapper.builder().build();

	UUID acme;

	UUID laura;

	UUID daniel;

	UUID mariaCustomer;

	UUID carlosCustomer;

	UUID anaCustomer;

	UUID northwind;

	UUID northwindAgent;

	UUID northwindCustomer;

	@BeforeEach
	void seedOrganizations() {
		this.acme = this.data.organization("Acme Studio");
		this.data.staff(this.acme, "admin", "Yelisson Ortiz", ADMIN);
		this.laura = this.data.staff(this.acme, "agent", "Laura Méndez", LAURA);
		this.daniel = this.data.staff(this.acme, "agent", "Daniel Santos", DANIEL);
		this.mariaCustomer = this.data.customer(this.acme, "María Pérez", MARIA, "Acme Studio");
		this.data.customerUser(this.acme, this.mariaCustomer, "María Pérez", MARIA);
		this.carlosCustomer = this.data.customer(this.acme, "Carlos Ruiz", "carlos@northstar.example", "Northstar");
		this.anaCustomer = this.data.customer(this.acme, "Ana García", "ana@orbit.example", "Orbit Labs");
		this.northwind = this.data.organization("Northwind Soporte", "Europe/Madrid");
		this.northwindAgent = this.data.staff(this.northwind, "agent", "Jordi Puig", NORTHWIND_AGENT);
		this.northwindCustomer = this.data.customer(this.northwind, "Marta Soler", "marta@soler.example", "Soler");
	}

	/** Crea un ticket por la API y devuelve el cuerpo de la respuesta. */
	JsonNode createTicket(String asUser, String body) throws Exception {
		MvcResult result = this.mvc
			.perform(post("/tickets").with(as(asUser)).contentType(MediaType.APPLICATION_JSON).content(body))
			.andExpect(status().isCreated())
			.andReturn();
		return JSON.readTree(result.getResponse().getContentAsString());
	}

	JsonNode createTicket(String asUser, UUID customerId, String subject, String priority, UUID assigneeId)
			throws Exception {
		String assignee = (assigneeId != null) ? "\"" + assigneeId + "\"" : "null";
		return createTicket(asUser, """
				{"customerId": "%s", "subject": "%s", "description": "Detalle de %s", "priority": "%s", "assigneeId": %s}
				""".formatted(customerId, subject, subject, priority, assignee));
	}

	JsonNode patchTicket(String asUser, long number, long version, String body) throws Exception {
		MvcResult result = this.mvc
			.perform(patch("/tickets/{number}", number).with(as(asUser))
				.contentType(TicketsController.MERGE_PATCH_JSON)
				.header("If-Match", "\"" + version + "\"")
				.content(body))
			.andExpect(status().isOk())
			.andReturn();
		return JSON.readTree(result.getResponse().getContentAsString());
	}

}
