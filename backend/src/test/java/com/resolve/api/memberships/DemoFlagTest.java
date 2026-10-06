package com.resolve.api.memberships;

import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** La bandera {@code demo} de la organización de {@code /me} sale de {@code resolve.demo.enabled}. */
@TestPropertySource(properties = "resolve.demo.enabled=true")
class DemoFlagTest extends ApiIntegrationTest {

	private UUID northwind;

	@BeforeEach
	void seed() {
		UUID acme = this.data.organization("Acme");
		this.northwind = this.data.organization("Northwind");
		UUID ana = this.data.staff(acme, "admin", "Ana", "ana@acme.example");
		this.data.membership(this.northwind, ana, "agent", "active");
	}

	@Test
	void meSaysTheInstallationIsADemo() throws Exception {
		this.mvc.perform(get(API + "/me").with(as("ana@acme.example")))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.organization.demo").value(true));
	}

	@Test
	void renamingAndSwitchingOrganizationKeepTheFlag() throws Exception {
		this.mvc.perform(patch(API + "/me").with(as("ana@acme.example"))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Ana María\"}"))
			.andExpect(status().isOk())
			.andExpect(matchesContract("updateMe"))
			.andExpect(jsonPath("$.organization.demo").value(true));
		this.mvc.perform(post(API + "/session/organization").with(as("ana@acme.example"))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"organizationId\": \"%s\"}".formatted(this.northwind)))
			.andExpect(jsonPath("$.organization.demo").value(true));
	}

}
