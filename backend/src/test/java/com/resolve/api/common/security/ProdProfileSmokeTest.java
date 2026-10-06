package com.resolve.api.common.security;

import java.util.Map;

import com.resolve.api.TestcontainersConfiguration;
import com.resolve.api.support.OidcTestConfiguration;
import com.resolve.api.support.TestData;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.web.server.autoconfigure.ServerProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static com.resolve.api.support.ApiIntegrationTest.API;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * El contexto arranca con {@code prod,oidc} y variables ficticias, y es lo que de verdad se despliega: sin login de
 * demostración, la API cerrada a quien no tiene sesión, las cookies con {@code Secure} y las cabeceras de seguridad.
 * Que {@code prod} no tiene valores por defecto lo demuestra {@code ProfileConfigurationTest}, que no necesita
 * contexto.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles({ "prod", "oidc" })
@Import({ TestcontainersConfiguration.class, TestData.class, OidcTestConfiguration.class })
// Las variables que prod exige, ficticias: la conexión real a la base de datos es la de Testcontainers y el registro del
// cliente OIDC es el de OidcTestConfiguration, que no necesita descubrir el proveedor.
@TestPropertySource(properties = { "DATABASE_URL=jdbc:postgresql://db.invalid/resolve", "DATABASE_USERNAME=resolve",
		"DATABASE_PASSWORD=ficticia", "RESOLVE_OIDC_ISSUER=https://idp.invalid/realms/resolve",
		"RESOLVE_OIDC_CLIENT_ID=resolve-api", "RESOLVE_OIDC_CLIENT_SECRET=ficticio",
		"RESOLVE_PUBLIC_URL=https://resolve.invalid", "RESOLVE_DEMO_ENABLED=false" })
class ProdProfileSmokeTest {

	@Autowired
	private MockMvc mvc;

	@Autowired
	private TestData data;

	@Autowired
	private Environment environment;

	@Autowired
	private ApplicationContext context;

	@Autowired
	private ServerProperties server;

	@BeforeEach
	void seed() {
		this.data.reset();
		var acme = this.data.organization("Acme");
		this.data.staff(acme, "admin", "Ana", "ana@acme.example");
	}

	@Test
	void thereIsNoDemoPrincipalResolverOnlyTheOidcOne() {
		Map<String, PrincipalResolver> resolvers = this.context.getBeansOfType(PrincipalResolver.class);

		assertThat(resolvers.values()).extracting((resolver) -> resolver.getClass().getSimpleName())
			.containsExactly("OidcPrincipalResolver");
		assertThat(this.environment.getProperty("resolve.demo.default-user")).isNull();
	}

	@Test
	void theApiIsClosedToWhoeverHasNoSessionEvenWithTheDemoHeader() throws Exception {
		this.mvc.perform(get(API + "/me"))
			.andExpect(status().isUnauthorized())
			.andExpect(content().contentTypeCompatibleWith("application/problem+json"))
			.andExpect(jsonPath("$.status").value(401));
		this.mvc.perform(get(API + "/me").header("X-Demo-User", "ana@acme.example"))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void aSignedInMemberGetsTheCsrfCookieWithSecureAndTheSessionCookieIsSecureToo() throws Exception {
		MvcResult result = this.mvc
			.perform(get(API + "/me").with(oidcLogin().idToken((token) -> token.claim("email", "ana@acme.example")
				.claim("email_verified", true))))
			.andExpect(status().isOk())
			.andReturn();

		Cookie csrf = result.getResponse().getCookie("XSRF-TOKEN");
		assertThat(csrf).isNotNull();
		assertThat(csrf.getSecure()).isTrue();
		assertThat(csrf.isHttpOnly()).isFalse();
		assertThat(this.server.getServlet().getSession().getCookie().getSecure()).isTrue();
		assertThat(this.server.getServlet().getSession().getCookie().getHttpOnly()).isTrue();
		assertThat(this.server.getServlet().getSession().getCookie().getPath()).isEqualTo(API);
	}

	@Test
	void everyResponseCarriesTheSecurityHeadersAndHstsOnlyOverHttps() throws Exception {
		this.mvc.perform(get(API + "/me").secure(true))
			.andExpect(header().string("Strict-Transport-Security", "max-age=31536000 ; includeSubDomains"))
			.andExpect(header().string("X-Content-Type-Options", "nosniff"))
			.andExpect(header().string("Referrer-Policy", "strict-origin-when-cross-origin"))
			.andExpect(header().string("X-Frame-Options", "DENY"))
			.andExpect(header().string("Content-Security-Policy", org.hamcrest.Matchers.startsWith("default-src 'self'")));
		// HSTS en HTTP plano no sirve de nada y algunos navegadores lo ignoran: solo en peticiones seguras.
		this.mvc.perform(get(API + "/me")).andExpect(header().doesNotExist("Strict-Transport-Security"));
	}

	@Test
	void stacktracesNeverReachAResponseAndTheProbesAreOn() {
		assertThat(this.environment.getProperty("spring.web.error.include-stacktrace")).isEqualTo("never");
		assertThat(this.environment.getProperty("management.endpoint.health.probes.enabled")).isEqualTo("true");
		assertThat(this.environment.getProperty("server.forward-headers-strategy")).isEqualTo("framework");
	}

	@Test
	void theReadinessProbeIsPublicUnderTheApiPrefix() throws Exception {
		this.mvc.perform(get(API + "/actuator/health/readiness"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("UP"));
		this.mvc.perform(get(API + "/actuator/health/liveness")).andExpect(status().isOk());
	}

}
