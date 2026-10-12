package com.resolve.api.common.security;

import java.util.UUID;

import com.resolve.api.support.ApiAccess;
import com.resolve.api.support.OidcApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * El alta abierta contra la cadena del perfil {@code oidc}, que tiene sesión y CSRF: la identidad que el proveedor
 * autenticó con correo verificado y que no tiene espacio puede crear el suyo y nada más; el correo sin verificar no es una
 * identidad y no crea nada; y la escritura exige el token CSRF como cualquier otra.
 */
@TestPropertySource(properties = "resolve.organizations.creation=open")
class OidcOpenWorkspaceCreationTest extends OidcApiIntegrationTest {

	private static final String EMAIL = "ana@lumen.example";

	private static final String BODY = "{\"name\": \"Lumen Diseño\", \"timeZone\": \"Europe/Madrid\"}";

	@Autowired
	private JdbcClient jdbc;

	private MockHttpServletRequestBuilder create(MockHttpSession session) {
		return post(API + "/organizations").session(session).contentType(MediaType.APPLICATION_JSON).content(BODY);
	}

	private int organizationCount() {
		return this.jdbc.sql("select count(*) from organizations").query(Integer.class).single();
	}

	@Test
	void aSignedInIdentityWithoutWorkspaceIsGreetedWithTheNameOfItsProviderAndCreatesItsFirstOne() throws Exception {
		MockHttpSession session = signedIn(EMAIL, true, "Ana Ruiz");

		this.mvc.perform(get(API + "/me").session(session))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.type").value("https://resolve.example/problems/no-membership"))
			.andExpect(jsonPath("$.canCreateOrganization").value(true))
			.andExpect(jsonPath("$.email").value(EMAIL))
			.andExpect(jsonPath("$.name").value("Ana Ruiz"));
		assertThat(this.data.usersWithEmail(EMAIL)).isZero();

		this.mvc.perform(create(session).with(csrfToken()))
			.andExpect(status().isCreated())
			.andExpect(matchesContract("createOrganization"))
			.andExpect(jsonPath("$.role").value("admin"))
			.andExpect(jsonPath("$.user.name").value("Ana Ruiz"))
			.andExpect(jsonPath("$.user.email").value(EMAIL))
			.andExpect(jsonPath("$.organization.name").value("Lumen Diseño"))
			.andExpect(jsonPath("$.organizations.length()").value(1));

		// La sesión del proveedor, que no cambió, ya entra con el principal del espacio nuevo.
		this.mvc.perform(get(API + "/me").session(session))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.organization.name").value("Lumen Diseño"))
			.andExpect(jsonPath("$.role").value("admin"));
		assertThat(this.data.usersWithEmail(EMAIL)).isEqualTo(1);
	}

	@Test
	void creatingNeedsTheCsrfTokenLikeAnyOtherWriteAndWithoutItNothingIsCreated() throws Exception {
		int before = organizationCount();
		MockHttpSession session = signedIn(EMAIL, true, "Ana Ruiz");

		this.mvc.perform(create(session))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.type").value("https://resolve.example/problems/csrf"));

		assertThat(organizationCount()).isEqualTo(before);
		assertThat(this.data.usersWithEmail(EMAIL)).isZero();
	}

	@Test
	void anEmailTheProviderHasNotVerifiedIsNoIdentityAndCreatesNothing() throws Exception {
		int before = organizationCount();
		MockHttpSession session = signedIn(EMAIL, false, "Ana Ruiz");

		this.mvc.perform(create(session).with(csrfToken()))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.type").value("about:blank"))
			.andExpect(jsonPath("$.canCreateOrganization").doesNotExist())
			.andExpect(jsonPath("$.email").doesNotExist())
			.andExpect(jsonPath("$.name").doesNotExist());
		this.mvc.perform(get(API + "/me").session(session))
			.andExpect(jsonPath("$.type").value("about:blank"))
			.andExpect(jsonPath("$.email").doesNotExist());

		assertThat(organizationCount()).isEqualTo(before);
		assertThat(this.data.usersWithEmail(EMAIL)).isZero();
	}

	@Test
	void anAnonymousCallerWithTheCsrfTokenGetsAPlain401() throws Exception {
		this.mvc.perform(post(API + "/organizations").with(csrfToken()).contentType(MediaType.APPLICATION_JSON).content(BODY))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.type").value("about:blank"))
			.andExpect(jsonPath("$.canCreateOrganization").doesNotExist());
	}

	@Test
	void aRemovedMemberDoesNotGetInThroughTheOpenDoor() throws Exception {
		UUID acme = this.data.organization("Acme");
		UUID laura = this.data.staff(acme, "agent", "Laura Méndez", "laura@acme.example");
		this.data.setMembershipStatus(acme, laura, "removed");
		int before = organizationCount();

		this.mvc.perform(create(signedIn("laura@acme.example")).with(csrfToken()))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.type").value("https://resolve.example/problems/access-deactivated"));

		assertThat(organizationCount()).isEqualTo(before);
	}

	@Test
	void anIdentityWithoutMembershipsReachesCreateOrganizationAndNoOtherOperationOfTheContract() throws Exception {
		int before = organizationCount();
		RequestPostProcessor csrf = csrfToken();
		RequestPostProcessor identity = (request) -> {
			request.setSession(signedIn(EMAIL, true, "Ana Ruiz"));
			return csrf.postProcessRequest(request);
		};

		assertThat(ApiAccess.identityWithoutMembershipViolations(this.mvc, identity, EMAIL, true)).isEmpty();

		assertThat(organizationCount()).isEqualTo(before);
		assertThat(this.data.usersWithEmail(EMAIL)).isZero();
	}

}
