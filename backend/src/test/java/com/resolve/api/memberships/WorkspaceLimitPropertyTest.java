package com.resolve.api.memberships;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** El límite de espacios por persona sale de {@code resolve.organizations.per-person-limit}, no de un 3 fijo. */
@TestPropertySource(properties = "resolve.organizations.per-person-limit=1")
class WorkspaceLimitPropertyTest extends ApiIntegrationTest {

	private static final String ADMIN = "admin@acme.example";

	@BeforeEach
	void seed() {
		this.data.staff(this.data.organization("Acme"), "admin", "Yelisson Ortiz", ADMIN);
	}

	@Test
	void theConfiguredLimitIsTheOneMeReportsAndTheOneTheServerEnforces() throws Exception {
		this.mvc.perform(get(API + "/me").with(as(ADMIN)))
			.andExpect(jsonPath("$.organizationCreation.allowed").value(true))
			.andExpect(jsonPath("$.organizationCreation.limit").value(1));

		this.mvc.perform(post(API + "/organizations").with(as(ADMIN))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Uno\", \"timeZone\": \"America/Bogota\"}"))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.organizationCreation.allowed").value(false))
			.andExpect(jsonPath("$.organizationCreation.created").value(1))
			.andExpect(jsonPath("$.organizationCreation.limit").value(1));
		this.mvc.perform(post(API + "/organizations").with(as(ADMIN))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Dos\", \"timeZone\": \"America/Bogota\"}"))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("createOrganization"))
			.andExpect(jsonPath("$.type").value("https://resolve.example/problems/organization-limit"));
	}

}
