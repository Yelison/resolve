package com.resolve.api.memberships;

import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MembershipsApiTest extends ApiIntegrationTest {

	private UUID acme;

	private UUID customerId;

	@BeforeEach
	void seed() {
		this.acme = this.data.organization("Acme Studio");
		this.data.staff(this.acme, "admin", "Yelisson Ortiz", "admin@acme.example");
		this.data.staff(this.acme, "agent", "laura Méndez", "laura@acme.example");
		this.data.staff(this.acme, "agent", "Daniel Santos", "daniel@acme.example");
		this.customerId = this.data.customer(this.acme, "María Pérez", "maria@cliente.example", "Acme Studio");
		this.data.customerUser(this.acme, this.customerId, "María Pérez", "maria@cliente.example");
		UUID other = this.data.organization("Northwind");
		this.data.staff(other, "agent", "Agente Ajeno", "agente@northwind.example");
	}

	@Test
	void meDescribesTheMemberAndTheirOrganization() throws Exception {
		this.mvc.perform(get("/me").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.user.email").value("laura@acme.example"))
			.andExpect(jsonPath("$.organization.id").value(this.acme.toString()))
			.andExpect(jsonPath("$.organization.timeZone").value("America/Bogota"))
			.andExpect(jsonPath("$.role").value("agent"))
			.andExpect(jsonPath("$.customerId").isEmpty());
	}

	@Test
	void meExposesTheSupportEmailOrNullWhenTheOrganizationHasNone() throws Exception {
		this.mvc.perform(get("/me").with(as("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.organization.supportEmail").isEmpty());
		this.data.supportEmail(this.acme, "ayuda@acme.example");
		this.mvc.perform(get("/me").with(as("maria@cliente.example")))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.organization.supportEmail").value("ayuda@acme.example"));
	}

	@Test
	void meLinksCustomersToTheirCustomerRecord() throws Exception {
		this.mvc.perform(get("/me").with(as("maria@cliente.example")))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.role").value("customer"))
			.andExpect(jsonPath("$.customerId").value(this.customerId.toString()));
	}

	@Test
	void assigneesAreTheOrganizationAdminsAndAgentsByName() throws Exception {
		this.mvc.perform(get("/assignees").with(as("admin@acme.example")))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listAssignees"))
			.andExpect(jsonPath("$[*].name", contains("Daniel Santos", "laura Méndez", "Yelisson Ortiz")));
	}

	@Test
	void assigneesOnlyListActiveStaff() throws Exception {
		this.data.staff(this.acme, "agent", "Inés Invitada", "invitada@acme.example", "invited");
		this.data.staff(this.acme, "admin", "Raúl Retirado", "retirado@acme.example", "removed");
		this.mvc.perform(get("/assignees").with(as("admin@acme.example")))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listAssignees"))
			.andExpect(jsonPath("$[*].name", contains("Daniel Santos", "laura Méndez", "Yelisson Ortiz")));
	}

	@Test
	void customersCannotListAssignees() throws Exception {
		this.mvc.perform(get("/assignees").with(as("maria@cliente.example")))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("listAssignees"));
	}

}
