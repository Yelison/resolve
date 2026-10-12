package com.resolve.api.common.security;

import java.time.Instant;
import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DemoAuthenticationTest extends ApiIntegrationTest {

	@Test
	void withoutHeaderTheTestProfileHasNoDefaultUser() throws Exception {
		this.mvc.perform(get(API + "/me"))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.type").value("about:blank"));
	}

	@Test
	void anUnknownUserIsNotAuthenticatedAndTheProblemSaysTheyHaveNoMembership() throws Exception {
		this.mvc.perform(get(API + "/me").with(as("nadie@example.com")))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.type").value("https://resolve.example/problems/no-membership"))
			.andExpect(jsonPath("$.canCreateOrganization").value(false))
			.andExpect(jsonPath("$.email").value("nadie@example.com"))
			.andExpect(jsonPath("$.name").value("nadie"));
	}

	@Test
	void onlyTheNoMembershipProblemCarriesTheIdentityExtensions() throws Exception {
		UUID acme = this.data.organization("Acme");
		UUID laura = this.data.staff(acme, "agent", "Laura Méndez", "laura@acme.example");
		this.data.setMembershipStatus(acme, laura, "removed");

		this.mvc.perform(get(API + "/me").with(as("laura@acme.example")))
			.andExpect(jsonPath("$.canCreateOrganization").doesNotExist())
			.andExpect(jsonPath("$.email").doesNotExist())
			.andExpect(jsonPath("$.name").doesNotExist());
		this.mvc.perform(get(API + "/me"))
			.andExpect(jsonPath("$.canCreateOrganization").doesNotExist())
			.andExpect(jsonPath("$.email").doesNotExist());
	}

	@Test
	void aRemovedMemberGetsTheAccessDeactivatedProblem() throws Exception {
		UUID acme = this.data.organization("Acme");
		UUID laura = this.data.staff(acme, "agent", "Laura Méndez", "laura@acme.example");
		this.data.setMembershipStatus(acme, laura, "removed");

		this.mvc.perform(get(API + "/me").with(as("laura@acme.example")))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.type").value("https://resolve.example/problems/access-deactivated"))
			.andExpect(jsonPath("$.detail").value("Tu acceso a esta organización fue desactivado"));
	}

	@Test
	void aPortalMemberOfAnArchivedCustomerGetsTheSameProblem() throws Exception {
		UUID acme = this.data.organization("Acme");
		UUID customer = this.data.customer(acme, "María Pérez", "maria@cliente.example", "Cliente");
		this.data.customerUser(acme, customer, "María Pérez", "maria@cliente.example");
		this.data.archiveCustomer(customer, Instant.parse("2026-10-01T10:00:00Z"));

		this.mvc.perform(get(API + "/me").with(as("maria@cliente.example")))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.type").value("https://resolve.example/problems/access-deactivated"));
	}

}
