package com.resolve.api.common.security;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import javax.sql.DataSource;

import com.resolve.api.support.OidcApiIntegrationTest;
import com.resolve.api.support.OidcTestConfiguration;
import com.resolve.api.support.RowLock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.client.web.HttpSessionOAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.client.web.OAuth2LoginAuthenticationFilter;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.util.UriComponentsBuilder;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Perfil {@code oidc}: la identidad verificada del proveedor (su correo) se traduce en la membresía de la base de
 * datos en cada petición, así que retirar a alguien o archivar a su cliente surte efecto aunque su sesión siga viva.
 */
class OidcAuthenticationTest extends OidcApiIntegrationTest {

	private static final String DEACTIVATED = "Tu acceso a esta organización fue desactivado";

	/** Mucho más que el tope del bloqueo: si la petición vuelve a esperar sin límite, el test falla en vez de colgarse. */
	private static final Duration LIMIT = Duration.ofSeconds(20);

	@Autowired
	private DataSource dataSource;

	@Autowired
	private FilterChainProxy filterChain;

	@Autowired
	private OAuth2AuthorizedClientRepository authorizedClients;

	private UUID acme;

	private UUID northwind;

	private UUID laura;

	@BeforeEach
	void seed() {
		this.acme = this.data.organization("Acme");
		this.northwind = this.data.organization("Northwind");
		this.laura = this.data.staff(this.acme, "agent", "Laura Méndez", "laura@acme.example");
	}

	@Test
	void aVerifiedOidcLoginResolvesTheMemberAndTheirOrganization() throws Exception {
		this.mvc
			.perform(get(API + "/me").with(oidcLogin().idToken((token) -> token.claim("email", "laura@acme.example")
				.claim("email_verified", true))))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.user.id").value(this.laura.toString()))
			.andExpect(jsonPath("$.user.email").value("laura@acme.example"))
			.andExpect(jsonPath("$.organization.id").value(this.acme.toString()))
			.andExpect(jsonPath("$.role").value("agent"));
	}

	@Test
	void theEmailIsMatchedWithoutCaseAndTheRoleLimitsTheApi() throws Exception {
		UUID customer = this.data.customer(this.acme, "María Pérez", "maria@cliente.example", "Cliente");
		this.data.customerUser(this.acme, customer, "María Pérez", "maria@cliente.example");

		this.mvc.perform(get(API + "/me").session(signedIn("MARIA@Cliente.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.role").value("customer"))
			.andExpect(jsonPath("$.customerId").value(customer.toString()));
		this.mvc.perform(get(API + "/customers").session(signedIn("maria@cliente.example")))
			.andExpect(status().isForbidden());
	}

	@Test
	void anEmailTheProviderHasNotVerifiedDoesNotAuthenticate() throws Exception {
		this.mvc.perform(get(API + "/me").session(signedIn("laura@acme.example", false, "Laura Méndez")))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("getMe"));
	}

	@Test
	void anIdentityWithoutTheVerifiedClaimDoesNotAuthenticate() throws Exception {
		this.mvc
			.perform(get(API + "/me").with(oidcLogin().idToken((token) -> token.claim("email", "laura@acme.example"))))
			.andExpect(status().isUnauthorized());
	}

	@Test
	void anIdentityWithoutMembershipsGetsA401AndNoUserIsCreated() throws Exception {
		this.mvc.perform(get(API + "/me").session(signedIn("nadie@acme.example")))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.detail").value("Inicia sesión para usar la API."));

		assertThat(this.data.usersWithEmail("nadie@acme.example")).isZero();
	}

	@Test
	void aRemovedMemberGetsA401ThatSaysTheAccessWasDeactivated() throws Exception {
		this.data.setMembershipStatus(this.acme, this.laura, "removed");

		this.mvc.perform(get(API + "/me").session(signedIn("laura@acme.example")))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("getMe"))
			.andExpect(jsonPath("$.detail").value(DEACTIVATED));
	}

	@Test
	void aPortalMemberOfAnArchivedCustomerGetsTheSame401() throws Exception {
		UUID customer = this.data.customer(this.acme, "María Pérez", "maria@cliente.example", "Cliente");
		this.data.customerUser(this.acme, customer, "María Pérez", "maria@cliente.example");
		this.data.archiveCustomer(customer, Instant.parse("2026-10-01T10:00:00Z"));

		this.mvc.perform(get(API + "/me").session(signedIn("maria@cliente.example")))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.detail").value(DEACTIVATED));
	}

	@Test
	void aSessionThatIsStillAliveStopsWorkingAsSoonAsTheMembershipIsRemoved() throws Exception {
		MockHttpSession session = signedIn("laura@acme.example");
		this.mvc.perform(get(API + "/me").session(session)).andExpect(status().isOk());

		this.data.setMembershipStatus(this.acme, this.laura, "removed");

		this.mvc.perform(get(API + "/me").session(session)).andExpect(status().isUnauthorized());
		this.mvc.perform(get(API + "/tickets").session(session)).andExpect(status().isUnauthorized());
	}

	@Test
	void theFirstAuthenticatedAccessActivatesAnInvitedMemberAndOnlyThem() throws Exception {
		UUID invited = this.data.staff(this.acme, "agent", "Nuria", "nuria@acme.example", "invited");
		UUID other = this.data.staff(this.acme, "agent", "Otro", "otro@acme.example", "invited");

		this.mvc.perform(get(API + "/me").session(signedIn("nuria@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.user.id").value(invited.toString()));

		assertThat(this.data.membershipStatus(this.acme, invited)).isEqualTo("active");
		assertThat(this.data.membershipStatus(this.acme, other)).isEqualTo("invited");
	}

	@Test
	void anInvitationToAnotherOrganizationIsNotActivatedWhileResolvingTheChosenOne() throws Exception {
		this.data.membership(this.northwind, this.laura, "agent", "invited");

		this.mvc.perform(get(API + "/me").session(signedIn("laura@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.organization.id").value(this.acme.toString()));

		assertThat(this.data.membershipStatus(this.northwind, this.laura)).isEqualTo("invited");
	}

	@Test
	void theProviderNameReplacesANameThatIsTheLocalPartOfTheEmail() throws Exception {
		UUID user = this.data.staff(this.acme, "agent", "nuria", "nuria@acme.example");

		this.mvc.perform(get(API + "/me").session(signedIn("nuria@acme.example", true, "Nuria Ferrer")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.user.name").value("Nuria Ferrer"));

		assertThat(this.data.userName(user)).isEqualTo("Nuria Ferrer");
	}

	@Test
	void anAccountHeldByAnotherTransactionIsNotWaitedForAndTheNameIsAdoptedOnTheNextRequest() throws Exception {
		UUID user = this.data.staff(this.acme, "agent", "nuria", "nuria@acme.example");

		try (RowLock lock = RowLock.hold(this.dataSource, "select id from users where id = ? for no key update",
				user)) {
			assertTimeoutPreemptively(LIMIT, () -> this.mvc
				.perform(get(API + "/me").session(signedIn("nuria@acme.example", true, "Nuria Ferrer")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.user.name").value("nuria")));

			assertThat(this.data.userName(user)).isEqualTo("nuria");
		}

		this.mvc.perform(get(API + "/me").session(signedIn("nuria@acme.example", true, "Nuria Ferrer")))
			.andExpect(jsonPath("$.user.name").value("Nuria Ferrer"));
		assertThat(this.data.userName(user)).isEqualTo("Nuria Ferrer");
	}

	@Test
	void aForeignKeyToTheAccountDoesNotSkipTheAdoptionOfTheProviderName() throws Exception {
		UUID user = this.data.staff(this.acme, "agent", "nuria", "nuria@acme.example");

		// Lo que deja un INSERT con clave foránea hacia users (mensaje, actividad, artículo) hasta su commit.
		try (RowLock lock = RowLock.hold(this.dataSource, "select id from users where id = ? for key share", user)) {
			assertTimeoutPreemptively(LIMIT, () -> this.mvc
				.perform(get(API + "/me").session(signedIn("nuria@acme.example", true, "Nuria Ferrer")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.user.name").value("Nuria Ferrer")));

			assertThat(this.data.userName(user)).isEqualTo("Nuria Ferrer");
		}
	}

	@Test
	void theProviderNameReplacesAnEmptyName() throws Exception {
		UUID user = this.data.staff(this.acme, "agent", "", "nuria@acme.example");

		this.mvc.perform(get(API + "/me").session(signedIn("nuria@acme.example", true, "Nuria Ferrer")))
			.andExpect(jsonPath("$.user.name").value("Nuria Ferrer"));

		assertThat(this.data.userName(user)).isEqualTo("Nuria Ferrer");
	}

	@Test
	void theProviderNeverOverwritesANameThePersonChose() throws Exception {
		this.mvc.perform(get(API + "/me").session(signedIn("laura@acme.example", true, "L. M. del Proveedor")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.user.name").value("Laura Méndez"));

		assertThat(this.data.userName(this.laura)).isEqualTo("Laura Méndez");
	}

	@Test
	void theDemoHeaderAuthenticatesNobodyWithTheOidcProfile() throws Exception {
		this.mvc.perform(get(API + "/me").with(as("laura@acme.example")))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("getMe"));
	}

	@Test
	void theDemoHeaderCannotReplaceTheOidcIdentity() throws Exception {
		this.data.staff(this.acme, "admin", "Ana", "ana@acme.example");

		this.mvc.perform(get(API + "/me").session(signedIn("laura@acme.example")).with(as("ana@acme.example")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.user.email").value("laura@acme.example"))
			.andExpect(jsonPath("$.role").value("agent"));
	}

	@Test
	void anUnauthenticatedApiCallIsAProblemNeverARedirect() throws Exception {
		for (String accept : new String[] { "application/json", "text/html", "*/*" }) {
			this.mvc.perform(get(API + "/tickets").header("Accept", accept))
				.andExpect(status().isUnauthorized())
				.andExpect(header().doesNotExist("Location"))
				.andExpect(content().contentTypeCompatibleWith("application/problem+json"))
				.andExpect(jsonPath("$.status").value(401));
		}
	}

	@Test
	void springDoesNotPublishItsGeneratedLoginPage() throws Exception {
		this.mvc.perform(get(API + "/login")).andExpect(status().isUnauthorized()).andExpect(header().doesNotExist("Location"));
	}

	@Test
	void signingInStartsTheAuthorizationCodeFlowWithPkce() throws Exception {
		MvcResult result = this.mvc.perform(get(API + "/oauth2/authorization/resolve"))
			.andExpect(status().is3xxRedirection())
			.andReturn();

		var location = UriComponentsBuilder.fromUriString(result.getResponse().getRedirectedUrl()).build();
		assertThat(result.getResponse().getRedirectedUrl()).startsWith(OidcTestConfiguration.AUTHORIZATION_URI);
		assertThat(location.getQueryParams().getFirst("response_type")).isEqualTo("code");
		assertThat(location.getQueryParams().getFirst("client_id")).isEqualTo("resolve-api");
		assertThat(location.getQueryParams().getFirst("scope")).contains("openid");
		assertThat(location.getQueryParams().getFirst("state")).isNotBlank();
		assertThat(location.getQueryParams().getFirst("code_challenge_method")).isEqualTo("S256");
		assertThat(location.getQueryParams().getFirst("code_challenge")).isNotBlank();
		assertThat(location.getQueryParams().getFirst("redirect_uri"))
			.isEqualTo("http://localhost/api/login/oauth2/code/resolve");
	}

	@Test
	void aLoginTheProviderRejectsReturnsToTheApplicationNotToASpringPage() throws Exception {
		this.mvc.perform(get(API + "/login/oauth2/code/resolve").param("error", "access_denied"))
			.andExpect(status().is3xxRedirection())
			.andExpect(header().string("Location", "http://localhost:5173/entrar?error=oidc"));
	}

	/**
	 * Los tokens del cliente OIDC (acceso, refresco) tienen que morir con la sesión. Con el valor por defecto de Spring
	 * Boot quedarían en un servicio en memoria, por usuario, aunque la sesión se invalidara. Como el login del
	 * navegador no se puede reproducir sin proveedor, se comprueba el cableado: el filtro que guarda el cliente tras el
	 * login usa el repositorio de sesión HTTP.
	 */
	@Test
	void theTokensOfTheOidcClientAreKeptInTheSessionAndNotInMemory() {
		OAuth2LoginAuthenticationFilter loginFilter = this.filterChain.getFilterChains()
			.stream()
			.flatMap((chain) -> chain.getFilters().stream())
			.filter(OAuth2LoginAuthenticationFilter.class::isInstance)
			.map(OAuth2LoginAuthenticationFilter.class::cast)
			.findFirst()
			.orElseThrow();

		assertThat(ReflectionTestUtils.getField(loginFilter, "authorizedClientRepository"))
			.isInstanceOf(HttpSessionOAuth2AuthorizedClientRepository.class);
		assertThat(this.authorizedClients).isInstanceOf(HttpSessionOAuth2AuthorizedClientRepository.class);
	}

	@Test
	void theSessionKeepsTheOidcTokenAndNeverTheResolvedPrincipal() throws Exception {
		MockHttpSession session = signedIn("laura@acme.example");
		this.mvc.perform(get(API + "/me").session(session)).andExpect(status().isOk());

		SecurityContext stored = (SecurityContext) session
			.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
		Authentication authentication = stored.getAuthentication();
		assertThat(authentication).isInstanceOf(OAuth2AuthenticationToken.class);
		assertThat(authentication).isNotInstanceOf(MemberAuthentication.class);
	}

}
