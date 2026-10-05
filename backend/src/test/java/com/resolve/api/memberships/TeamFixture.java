package com.resolve.api.memberships;

import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Dos organizaciones: Acme (un administrador, dos agentes, una persona invitada, una retirada y una clienta con
 * acceso) y Northwind (un administrador y un agente), para probar permisos y aislamiento en cada operación del equipo.
 */
abstract class TeamFixture extends ApiIntegrationTest {

	static final String ADMIN = "admin@acme.example";

	static final String LAURA = "laura@acme.example";

	static final String DANIEL = "daniel@acme.example";

	static final String INVITED = "invitada@acme.example";

	static final String REMOVED = "retirado@acme.example";

	static final String MARIA = "maria@cliente.example";

	static final String NORTHWIND_ADMIN = "admin@northwind.example";

	static final JsonMapper JSON = JsonMapper.builder().build();

	UUID acme;

	UUID admin;

	UUID laura;

	UUID daniel;

	UUID invited;

	UUID removed;

	UUID mariaCustomer;

	UUID mariaUser;

	UUID northwind;

	UUID northwindAdmin;

	UUID northwindAgent;

	@BeforeEach
	void seedTeams() {
		this.acme = this.data.organization("Acme Studio");
		this.admin = this.data.staff(this.acme, "admin", "Yelisson Ortiz", ADMIN);
		this.laura = this.data.staff(this.acme, "agent", "Laura Méndez", LAURA);
		this.daniel = this.data.staff(this.acme, "agent", "Daniel Santos", DANIEL);
		this.invited = this.data.staff(this.acme, "agent", "Inés Invitada", INVITED, "invited");
		this.removed = this.data.staff(this.acme, "agent", "Raúl Retirado", REMOVED, "removed");
		this.mariaCustomer = this.data.customer(this.acme, "María Pérez", MARIA, "Acme Studio");
		this.mariaUser = this.data.customerUser(this.acme, this.mariaCustomer, "María Pérez", MARIA);
		this.northwind = this.data.organization("Northwind Soporte", "Europe/Madrid");
		this.northwindAdmin = this.data.staff(this.northwind, "admin", "Ada Norte", NORTHWIND_ADMIN);
		this.northwindAgent = this.data.staff(this.northwind, "agent", "Jordi Puig", "agente@northwind.example");
	}

	MvcResult invite(String asUser, String body) throws Exception {
		return this.mvc.perform(post(API + "/members").with(as(asUser)).contentType(MediaType.APPLICATION_JSON).content(body))
			.andReturn();
	}

	MvcResult changeRole(String asUser, UUID userId, String role) throws Exception {
		return this.mvc.perform(post(API + "/members/" + userId + "/role").with(as(asUser))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"role\": \"%s\"}".formatted(role))).andReturn();
	}

	MvcResult remove(String asUser, UUID userId) throws Exception {
		return this.mvc.perform(post(API + "/members/" + userId + "/remove").with(as(asUser))).andReturn();
	}

	JsonNode listMembers(String asUser) throws Exception {
		return body(this.mvc.perform(get(API + "/members").with(as(asUser))).andReturn());
	}

	static JsonNode body(MvcResult result) throws Exception {
		return JSON.readTree(result.getResponse().getContentAsString());
	}

}
