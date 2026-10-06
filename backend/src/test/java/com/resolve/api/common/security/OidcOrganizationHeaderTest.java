package com.resolve.api.common.security;

import java.util.UUID;

import com.resolve.api.support.OidcApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code X-Organization-Id} con la cadena de {@code oidc}: la organización es la de la sesión del servidor, que otra
 * pestaña puede cambiar, y la comprobación convive con el CSRF y con el 401.
 */
class OidcOrganizationHeaderTest extends OidcApiIntegrationTest {

	private static final String EMAIL = "ana@acme.example";

	private static final String MISMATCH = "https://resolve.example/problems/organization-mismatch";

	private UUID acme;

	private UUID northwind;

	private UUID ana;

	@BeforeEach
	void seed() {
		this.acme = this.data.organization("Acme");
		this.northwind = this.data.organization("Northwind");
		this.ana = this.data.staff(this.acme, "admin", "Ana", EMAIL);
		this.data.membership(this.northwind, this.ana, "agent", "active");
	}

	private MockHttpSession sessionIn(UUID organization) throws Exception {
		MockHttpSession session = signedIn(EMAIL);
		this.mvc.perform(post(API + "/session/organization").session(session)
			.with(csrfToken())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"organizationId\":\"" + organization + "\"}")).andExpect(status().isOk());
		return session;
	}

	@Test
	void theSessionAlreadyInAnotherOrganizationRefusesTheStaleWriteAndChangesNothing() throws Exception {
		// Esta pestaña mostraba Acme; otra ya cambió la sesión a Northwind.
		MockHttpSession session = sessionIn(this.northwind);

		this.mvc.perform(patch(API + "/me").session(session)
			.with(csrfToken())
			.header("X-Organization-Id", this.acme.toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Ana Nueva\"}"))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("updateMe"))
			.andExpect(jsonPath("$.type").value(MISMATCH));
		this.mvc.perform(get(API + "/me").session(session)).andExpect(jsonPath("$.user.name").value("Ana"));

		this.mvc.perform(patch(API + "/me").session(session)
			.with(csrfToken())
			.header("X-Organization-Id", this.northwind.toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Ana Nueva\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.user.name").value("Ana Nueva"));
	}

	@Test
	void theCsrfRejectionComesBeforeTheOrganizationCheck() throws Exception {
		this.mvc.perform(post(API + "/tickets").session(signedIn(EMAIL))
			.header("X-Organization-Id", this.northwind.toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{}"))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.type").value("https://resolve.example/problems/csrf"));
	}

	@Test
	void withoutASessionTheAnswerIsA401NotA409() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(csrfToken())
			.header("X-Organization-Id", this.northwind.toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{}"))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.type").value("about:blank"));
	}

	@Test
	void aMemberWhoLostAccessToTheOrganizationShownGetsTheMismatchAndChangesNothing() throws Exception {
		// La pantalla sigue en Northwind, pero la membresía se retiró: la sesión cae en Acme y no se escribe allí por error.
		MockHttpSession session = sessionIn(this.northwind);
		this.data.setMembershipStatus(this.northwind, this.ana, "removed");

		this.mvc.perform(patch(API + "/me").session(session)
			.with(csrfToken())
			.header("X-Organization-Id", this.northwind.toString())
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Ana Nueva\"}"))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.type").value(MISMATCH));
		this.mvc.perform(get(API + "/me").session(session))
			.andExpect(jsonPath("$.organization.id").value(this.acme.toString()))
			.andExpect(jsonPath("$.user.name").value("Ana"));
	}

}
