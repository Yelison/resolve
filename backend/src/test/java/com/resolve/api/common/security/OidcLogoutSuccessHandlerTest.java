package com.resolve.api.common.security;

import java.time.Instant;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.oauth2.core.AuthorizationGrantType;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.web.util.UriComponents;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

/** La URL de cierre de sesión del proveedor (RP-initiated logout) que {@code POST /logout} devuelve en el cuerpo. */
class OidcLogoutSuccessHandlerTest {

	private static final String PUBLIC_URL = "http://localhost:5173";

	private static final String END_SESSION = "https://idp.test/realms/resolve/protocol/openid-connect/logout";

	private static final String ID_TOKEN = "id-token.de-quien-sale";

	private static final JsonMapper JSON = JsonMapper.builder().build();

	@Test
	void theBodyCarriesTheEndSessionUrlWithTheIdTokenHintAndTheApplicationAsReturnUrl() throws Exception {
		MockHttpServletResponse response = logout(handler(true), signedIn());

		assertThat(response.getStatus()).isEqualTo(200);
		assertThat(response.getHeader("Location")).isNull();
		assertThat(response.getContentType()).startsWith("application/json");
		JsonNode body = JSON.readTree(response.getContentAsString());
		assertThat(body.propertyNames()).containsExactly("logoutUrl");
		UriComponents url = UriComponentsBuilder.fromUriString(body.get("logoutUrl").asString()).build();
		assertThat(url.getScheme() + "://" + url.getHost() + url.getPath()).isEqualTo(END_SESSION);
		assertThat(url.getQueryParams().getFirst("id_token_hint")).isEqualTo(ID_TOKEN);
		assertThat(java.net.URLDecoder.decode(url.getQueryParams().getFirst("post_logout_redirect_uri"),
				java.nio.charset.StandardCharsets.UTF_8))
			.isEqualTo(PUBLIC_URL);
	}

	@Test
	void theUrlCarriesNothingOfTheClientBeyondTheIdToken() throws Exception {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.getSession(true);
		String sessionId = request.getSession().getId();
		MockHttpServletResponse response = new MockHttpServletResponse();

		handler(true).onLogoutSuccess(request, response, signedIn());

		String url = JSON.readTree(response.getContentAsString()).get("logoutUrl").asString();
		assertThat(url).doesNotContain("secreto-de-prueba").doesNotContain("client_secret").doesNotContain(sessionId);
		assertThat(UriComponentsBuilder.fromUriString(url).build().getQueryParams().keySet())
			.isSubsetOf("id_token_hint", "post_logout_redirect_uri", "client_id");
	}

	@Test
	void withoutAnEndSessionEndpointTheClientGoesBackToTheApplication() throws Exception {
		MockHttpServletResponse response = logout(handler(false), signedIn());

		assertThat(response.getStatus()).isEqualTo(200);
		assertThat(JSON.readTree(response.getContentAsString()).get("logoutUrl").asString()).isEqualTo(PUBLIC_URL);
	}

	@Test
	void withoutASessionTheClientGoesBackToTheApplication() throws Exception {
		MockHttpServletResponse response = logout(handler(true), null);

		assertThat(response.getStatus()).isEqualTo(200);
		assertThat(JSON.readTree(response.getContentAsString()).get("logoutUrl").asString()).isEqualTo(PUBLIC_URL);
	}

	private static MockHttpServletResponse logout(OidcLogoutSuccessHandler handler, OAuth2AuthenticationToken token)
			throws Exception {
		MockHttpServletResponse response = new MockHttpServletResponse();
		handler.onLogoutSuccess(new MockHttpServletRequest(), response, token);
		return response;
	}

	private static OidcLogoutSuccessHandler handler(boolean providerHasEndSession) {
		ClientRegistration.Builder registration = registration();
		if (providerHasEndSession) {
			registration.providerConfigurationMetadata(Map.of("end_session_endpoint", END_SESSION));
		}
		return new OidcLogoutSuccessHandler(new InMemoryClientRegistrationRepository(registration.build()), PUBLIC_URL,
				JSON);
	}

	private static ClientRegistration.Builder registration() {
		return ClientRegistration.withRegistrationId("resolve")
			.clientId("resolve-api")
			.clientSecret("secreto-de-prueba")
			.authorizationGrantType(AuthorizationGrantType.AUTHORIZATION_CODE)
			.redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
			.scope("openid")
			.authorizationUri("https://idp.test/auth")
			.tokenUri("https://idp.test/token")
			.jwkSetUri("https://idp.test/certs")
			.userNameAttributeName("sub");
	}

	private static OAuth2AuthenticationToken signedIn() {
		OidcIdToken idToken = OidcIdToken.withTokenValue(ID_TOKEN)
			.subject("sub-1")
			.claim("email", "laura@acme.example")
			.issuedAt(Instant.now())
			.expiresAt(Instant.now().plusSeconds(300))
			.build();
		DefaultOidcUser user = new DefaultOidcUser(AuthorityUtils.createAuthorityList("OIDC_USER"), idToken);
		return new OAuth2AuthenticationToken(user, user.getAuthorities(), "resolve");
	}

}
