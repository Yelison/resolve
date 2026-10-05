package com.resolve.api.customers;

import java.time.Instant;
import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Dos organizaciones: Acme (administradora, agente, tres clientes y una clienta con acceso al portal) y Northwind
 * (un agente y un cliente), para probar permisos y aislamiento en cada operación de clientes.
 */
abstract class CustomersFixture extends ApiIntegrationTest {

	static final String ADMIN = "admin@acme.example";

	static final String LAURA = "laura@acme.example";

	static final String MARIA = "maria@cliente.example";

	static final String NORTHWIND_AGENT = "agente@northwind.example";

	static final Instant JOINED = Instant.parse("2026-09-01T09:00:00Z");

	static final JsonMapper JSON = JsonMapper.builder().build();

	UUID acme;

	UUID mariaCustomer;

	UUID carlosCustomer;

	UUID anaCustomer;

	UUID northwind;

	UUID northwindCustomer;

	@BeforeEach
	void seedOrganizations() {
		this.acme = this.data.organization("Acme Studio");
		this.data.staff(this.acme, "admin", "Yelisson Ortiz", ADMIN);
		this.data.staff(this.acme, "agent", "Laura Méndez", LAURA);
		this.mariaCustomer = this.data.customer(this.acme, "María Pérez", MARIA, "Acme Studio", JOINED);
		this.data.customerUser(this.acme, this.mariaCustomer, "María Pérez", MARIA);
		this.carlosCustomer = this.data.customer(this.acme, "Carlos Ruiz", "carlos@northstar.example", "Northstar",
				JOINED.plusSeconds(60));
		this.anaCustomer = this.data.customer(this.acme, "Ana García", "ana@orbit.example", "Orbit Labs",
				JOINED.plusSeconds(120));
		this.northwind = this.data.organization("Northwind Soporte", "Europe/Madrid");
		this.data.staff(this.northwind, "agent", "Jordi Puig", NORTHWIND_AGENT);
		this.northwindCustomer = this.data.customer(this.northwind, "Marta Soler", "marta@soler.example", "Soler",
				JOINED);
	}

	JsonNode listAs(String user, String query) throws Exception {
		MvcResult result = this.mvc.perform(get(API + "/customers" + query).with(as(user))).andReturn();
		return JSON.readTree(result.getResponse().getContentAsString());
	}

	/** Crea un cliente por la API y devuelve el cuerpo de la respuesta (debe ser un 201). */
	JsonNode createCustomer(String user, String body) throws Exception {
		MvcResult result = this.mvc
			.perform(post(API + "/customers").with(as(user)).contentType(MediaType.APPLICATION_JSON).content(body))
			.andReturn();
		return JSON.readTree(result.getResponse().getContentAsString());
	}

	MvcResult getCustomer(String user, UUID id) throws Exception {
		return this.mvc.perform(get(API + "/customers/" + id).with(as(user))).andReturn();
	}

	MvcResult patchCustomer(String user, UUID id, String version, String body) throws Exception {
		return this.mvc
			.perform(patch(API + "/customers/" + id).with(as(user))
				.header("If-Match", "\"" + version + "\"")
				.contentType("application/merge-patch+json")
				.content(body))
			.andReturn();
	}

	MvcResult archive(String user, UUID id) throws Exception {
		return this.mvc.perform(post(API + "/customers/" + id + "/archive").with(as(user))).andReturn();
	}

	MvcResult restore(String user, UUID id) throws Exception {
		return this.mvc.perform(post(API + "/customers/" + id + "/restore").with(as(user))).andReturn();
	}

	static JsonNode body(MvcResult result) throws Exception {
		return JSON.readTree(result.getResponse().getContentAsString());
	}

}
