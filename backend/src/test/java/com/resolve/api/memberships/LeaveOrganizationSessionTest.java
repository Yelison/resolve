package com.resolve.api.memberships;

import java.util.UUID;

import com.resolve.api.support.OidcApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Salir de la organización de la propia sesión, de extremo a extremo con la sesión OIDC real: la petición siguiente
 * cae en la primera membresía utilizable y, si no queda ninguna, en el 401 de acceso desactivado.
 */
class LeaveOrganizationSessionTest extends OidcApiIntegrationTest {

	private static final String EMAIL = "sofia@acme.example";

	private UUID acme;

	private UUID northwind;

	private UUID sofia;

	@BeforeEach
	void seed() {
		this.acme = this.data.organization("Acme");
		this.northwind = this.data.organization("Northwind");
		this.sofia = this.data.staff(this.acme, "agent", "Sofía Ríos", EMAIL);
		this.data.membership(this.northwind, this.sofia, "agent", "active");
		this.data.staff(this.acme, "admin", "Ada Acme", "ada@acme.example");
		this.data.staff(this.northwind, "admin", "Jordi Puig", "jordi@northwind.example");
	}

	private MockHttpServletRequestBuilder select(MockHttpSession session, UUID organizationId) {
		return post(API + "/session/organization").session(session)
			.with(csrfToken())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"organizationId\":\"" + organizationId + "\"}");
	}

	private MockHttpServletRequestBuilder leave(MockHttpSession session, UUID organizationId) {
		return delete(API + "/me/organizations/" + organizationId).session(session).with(csrfToken());
	}

	@Test
	void leavingTheOrganizationOfTheSessionFallsBackToTheFirstUsableMembership() throws Exception {
		MockHttpSession session = signedIn(EMAIL);
		this.mvc.perform(select(session, this.northwind)).andExpect(status().isOk());
		this.mvc.perform(get(API + "/me").session(session))
			.andExpect(jsonPath("$.organization.id").value(this.northwind.toString()));

		this.mvc.perform(leave(session, this.northwind))
			.andExpect(status().isNoContent())
			.andExpect(matchesContract("leaveOrganization"));

		// La sesión todavía guarda Northwind, pero ya no es utilizable: la siguiente petición cae en Acme.
		this.mvc.perform(get(API + "/me").session(session))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.organization.id").value(this.acme.toString()))
			.andExpect(jsonPath("$.organizations.length()").value(1));
		this.mvc.perform(get(API + "/session/organizations").session(session))
			.andExpect(jsonPath("$.length()").value(1))
			.andExpect(jsonPath("$[0].id").value(this.acme.toString()));
		// Y no puede volver a elegirla: es ajena para ella desde ahora.
		this.mvc.perform(select(session, this.northwind)).andExpect(status().isForbidden());
	}

	@Test
	void leavingTheLastOrganizationEndsTheAccessWithATypedUnauthorized() throws Exception {
		MockHttpSession session = signedIn(EMAIL);
		this.mvc.perform(leave(session, this.northwind)).andExpect(status().isNoContent());
		this.mvc.perform(leave(session, this.acme)).andExpect(status().isNoContent());

		// Sus membresías quedaron `removed`, no borradas: el API no distingue salir de ser retirada, así que el tipo
		// es el de acceso desactivado y no el de «sin membresías» del ADR 0004 (que exigiría saber quién se retiró).
		this.mvc.perform(get(API + "/me").session(session))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.type").value("https://resolve.example/problems/access-deactivated"));
		assertThat(this.data.membershipStatus(this.acme, this.sofia)).isEqualTo("removed");
		assertThat(this.data.membershipStatus(this.northwind, this.sofia)).isEqualTo("removed");
	}

	@Test
	void leavingAnotherOrganizationKeepsTheSessionWhereItWas() throws Exception {
		MockHttpSession session = signedIn(EMAIL);
		this.mvc.perform(select(session, this.northwind)).andExpect(status().isOk());

		this.mvc.perform(leave(session, this.acme)).andExpect(status().isNoContent());

		this.mvc.perform(get(API + "/me").session(session))
			.andExpect(jsonPath("$.organization.id").value(this.northwind.toString()));
	}

	@Test
	void theCsrfTokenIsRequired() throws Exception {
		this.mvc.perform(delete(API + "/me/organizations/" + this.acme).session(signedIn(EMAIL)))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.type").value("https://resolve.example/problems/csrf"));
		assertThat(this.data.membershipStatus(this.acme, this.sofia)).isEqualTo("active");
	}

}
