package com.resolve.api.memberships;

import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * El login de demostración (perfiles dev y test) también respeta la organización elegida en la sesión, para que el
 * selector funcione sin proveedor de identidad. La cabecera sigue identificando a la persona en cada petición.
 */
class SessionOrganizationDemoTest extends ApiIntegrationTest {

	private static final String EMAIL = "sofia@acme.example";

	private UUID acme;

	private UUID northwind;

	@BeforeEach
	void seed() {
		this.acme = this.data.organization("Acme");
		this.northwind = this.data.organization("Northwind");
		UUID sofia = this.data.staff(this.acme, "admin", "Sofía Ríos", EMAIL);
		this.data.membership(this.northwind, sofia, "agent", "active");
	}

	@Test
	void theDemoUserCanSwitchOrganizationAndTheSessionRemembersIt() throws Exception {
		MockHttpSession session = new MockHttpSession();

		this.mvc.perform(post("/session/organization").session(session)
			.with(as(EMAIL))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"organizationId\":\"" + this.northwind + "\"}"))
			.andExpect(status().isOk())
			.andExpect(matchesContract("selectSessionOrganization"))
			.andExpect(jsonPath("$.organization.id").value(this.northwind.toString()));

		this.mvc.perform(get("/me").session(session).with(as(EMAIL)))
			.andExpect(jsonPath("$.organization.id").value(this.northwind.toString()))
			.andExpect(jsonPath("$.role").value("agent"));
		this.mvc.perform(get("/me").with(as(EMAIL)))
			.andExpect(jsonPath("$.organization.id").value(this.acme.toString()));
	}

	@Test
	void theDemoUserCannotChooseAnOrganizationWhereTheyHaveNoMembership() throws Exception {
		UUID foreign = this.data.organization("Ajena");

		this.mvc.perform(post("/session/organization").with(as(EMAIL))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"organizationId\":\"" + foreign + "\"}"))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("selectSessionOrganization"));
	}

	@Test
	void theDemoUserListsTheirOrganizations() throws Exception {
		this.mvc.perform(get("/session/organizations").with(as(EMAIL)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listSessionOrganizations"))
			.andExpect(jsonPath("$.length()").value(2));
	}

}
