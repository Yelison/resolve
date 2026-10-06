package com.resolve.api.common.error;

import com.resolve.api.support.OidcApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** El 405 en la cadena {@code oidc}: con sesión y token CSRF llega a Spring MVC, que responde Problem en español. */
class OidcMethodNotAllowedTest extends OidcApiIntegrationTest {

	@BeforeEach
	void seed() {
		var acme = this.data.organization("Acme");
		this.data.staff(acme, "agent", "Laura Méndez", "laura@acme.example");
	}

	@Test
	void aWrongMethodIsASpanishProblemThatKeepsTheAllowHeader() throws Exception {
		this.mvc.perform(post(API + "/me").session(signedIn("laura@acme.example")).with(csrfToken()))
			.andExpect(status().isMethodNotAllowed())
			.andExpect(header().exists("Allow"))
			.andExpect(content().contentTypeCompatibleWith("application/problem+json"))
			.andExpect(jsonPath("$.title").value("Método no permitido"))
			.andExpect(jsonPath("$.detail").value("Esta ruta no admite ese método."));
	}

}
