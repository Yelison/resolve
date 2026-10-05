package com.resolve.api.common.security;

import jakarta.servlet.http.Cookie;
import com.resolve.api.support.OidcApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * CSRF por cookie y cabecera para las peticiones que se autentican con la cookie de sesión: la API escribe una cookie
 * {@code XSRF-TOKEN} legible por JavaScript y exige su valor en {@code X-XSRF-TOKEN} en toda petición no segura.
 */
class CsrfTest extends OidcApiIntegrationTest {

	private static final String RENAME = "{\"name\":\"Laura M.\"}";

	@BeforeEach
	void seed() {
		var acme = this.data.organization("Acme");
		this.data.staff(acme, "agent", "Laura Méndez", "laura@acme.example");
	}

	@Test
	void theFirstGetSetsAReadableCsrfCookieForTheWholeSite() throws Exception {
		MvcResult result = this.mvc.perform(get("/me").session(signedIn("laura@acme.example"))).andReturn();

		// MockMvc no escribe SameSite en la cabecera, pero sí lo deja como atributo de la cookie que Tomcat serializa.
		Cookie csrf = result.getResponse().getCookie("XSRF-TOKEN");
		assertThat(csrf).isNotNull();
		assertThat(csrf.getValue()).isNotBlank();
		assertThat(csrf.getPath()).isEqualTo("/");
		assertThat(csrf.isHttpOnly()).isFalse();
		assertThat(csrf.getAttribute("SameSite")).isEqualTo("Lax");
	}

	@Test
	void aPostWithoutTheCsrfHeaderIsForbiddenWithAProblemThatSaysSo() throws Exception {
		this.mvc.perform(rename(signedIn("laura@acme.example")))
			.andExpect(status().isForbidden())
			.andExpect(content().contentTypeCompatibleWith("application/problem+json"))
			.andExpect(jsonPath("$.status").value(403))
			.andExpect(jsonPath("$.detail").value("Falta el token CSRF o no es válido."));
	}

	@Test
	void everyUnsafeMethodNeedsTheToken() throws Exception {
		MockHttpSession session = signedIn("laura@acme.example");
		this.mvc.perform(post("/tickets").session(session).contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isForbidden());
		this.mvc.perform(delete("/tickets/1").session(session)).andExpect(status().isForbidden());
		this.mvc.perform(post("/session/organization").session(session)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{}")).andExpect(status().isForbidden());
	}

	@Test
	void theHeaderPlusTheMatchingCookieIsAccepted() throws Exception {
		MockHttpSession session = signedIn("laura@acme.example");
		String token = csrfCookie(session);

		this.mvc.perform(rename(session).cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token))
			.andExpect(status().isOk())
			.andExpect(matchesContract("updateMe"))
			.andExpect(jsonPath("$.user.name").value("Laura M."));
	}

	@Test
	void aWrongTokenIsForbidden() throws Exception {
		MockHttpSession session = signedIn("laura@acme.example");
		String token = csrfCookie(session);

		this.mvc.perform(rename(session).cookie(new Cookie("XSRF-TOKEN", token)).header("X-XSRF-TOKEN", token + "x"))
			.andExpect(status().isForbidden());
	}

	@Test
	void theHeaderWithoutTheCookieIsForbidden() throws Exception {
		MockHttpSession session = signedIn("laura@acme.example");
		String token = csrfCookie(session);

		this.mvc.perform(rename(session).header("X-XSRF-TOKEN", token)).andExpect(status().isForbidden());
	}

	@Test
	void anExpiredSessionWithAValidTokenIsA401NotA403() throws Exception {
		String token = "token-de-un-navegador-sin-sesion";

		this.mvc.perform(patch("/me").contentType(MediaType.APPLICATION_JSON)
			.content(RENAME)
			.cookie(new Cookie("XSRF-TOKEN", token))
			.header("X-XSRF-TOKEN", token))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.status").value(401));
	}

	@Test
	void logoutNeedsTheCsrfHeaderLikeEveryUnsafeRequest() throws Exception {
		MockHttpSession session = signedIn("laura@acme.example");

		this.mvc.perform(post("/logout").session(session))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("logout"));

		assertThat(session.isInvalid()).isFalse();
		this.mvc.perform(get("/me").session(session)).andExpect(status().isOk());
	}

	@Test
	void logoutEndsTheSessionWithA204AndTheNextCallIsA401() throws Exception {
		MockHttpSession session = signedIn("laura@acme.example");
		this.mvc.perform(get("/me").session(session)).andExpect(status().isOk());

		this.mvc.perform(post("/logout").session(session).with(csrfToken()))
			.andExpect(status().isNoContent())
			.andExpect(matchesContract("logout"));

		assertThat(session.isInvalid()).isTrue();
		this.mvc.perform(get("/me").session(session)).andExpect(status().isUnauthorized());
	}

	@Test
	void logoutWithoutASessionIsIdempotent() throws Exception {
		this.mvc.perform(post("/logout").with(csrfToken()))
			.andExpect(status().isNoContent())
			.andExpect(matchesContract("logout"));
	}

	private String csrfCookie(MockHttpSession session) throws Exception {
		MvcResult result = this.mvc.perform(get("/me").session(session)).andReturn();
		return result.getResponse()
			.getHeaders("Set-Cookie")
			.stream()
			.filter((cookie) -> cookie.startsWith("XSRF-TOKEN="))
			.map((cookie) -> cookie.substring("XSRF-TOKEN=".length(), cookie.indexOf(';')))
			.findFirst()
			.orElseThrow();
	}

	private static MockHttpServletRequestBuilder rename(MockHttpSession session) {
		return patch("/me").session(session).contentType(MediaType.APPLICATION_JSON).content(RENAME);
	}

}
