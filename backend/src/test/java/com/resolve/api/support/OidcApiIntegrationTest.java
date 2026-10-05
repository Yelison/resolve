package com.resolve.api.support;

import java.time.Instant;

import jakarta.servlet.http.Cookie;

import org.jspecify.annotations.Nullable;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * Base de los tests de la API con el perfil {@code oidc}: sin login de demostración y con un registro de cliente que no
 * necesita red. {@link #signedIn(String)} deja una sesión HTTP como la que deja el inicio de sesión real (el token de
 * OpenID Connect en el contexto de seguridad de la sesión), para tests que encadenan varias peticiones.
 */
// La URL pública se fija aquí: los tests comprueban adónde vuelve el navegador y no deben depender de que el entorno
// (por ejemplo RESOLVE_PUBLIC_URL de un slot de Herdr) la defina. Las propiedades de test pesan más que las variables.
@TestPropertySource(properties = "resolve.public-url=" + OidcApiIntegrationTest.PUBLIC_URL)
@ActiveProfiles("oidc")
@Import(OidcTestConfiguration.class)
public abstract class OidcApiIntegrationTest extends ApiIntegrationTest {

	public static final String PUBLIC_URL = "http://localhost:5173";

	private static final String CSRF_TOKEN = "token-csrf-de-prueba";

	/**
	 * Cookie y cabecera CSRF como los envía la aplicación web. No se usa {@code csrf()} de spring-security-test: sustituye
	 * para siempre, en el filtro compartido por todos los tests del mismo contexto, el repositorio de tokens por uno de
	 * sesión, y los tests de la cookie real dejarían de ver su {@code XSRF-TOKEN} según el orden de ejecución.
	 */
	protected static RequestPostProcessor csrfToken() {
		return (request) -> {
			request.setCookies(new Cookie("XSRF-TOKEN", CSRF_TOKEN));
			request.addHeader("X-XSRF-TOKEN", CSRF_TOKEN);
			return request;
		};
	}

	protected static MockHttpSession signedIn(String email) {
		return signedIn(email, true, null);
	}

	protected static MockHttpSession signedIn(String email, boolean emailVerified, @Nullable String name) {
		MockHttpSession session = new MockHttpSession();
		session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
				new SecurityContextImpl(token(email, emailVerified, name)));
		return session;
	}

	protected static OAuth2AuthenticationToken token(String email, boolean emailVerified, @Nullable String name) {
		OidcIdToken.Builder idToken = OidcIdToken.withTokenValue("token-de-prueba")
			.subject("sub-" + email)
			.claim("email", email)
			.claim("email_verified", emailVerified)
			.issuedAt(Instant.now())
			.expiresAt(Instant.now().plusSeconds(300));
		if (name != null) {
			idToken.claim("name", name);
		}
		DefaultOidcUser user = new DefaultOidcUser(AuthorityUtils.createAuthorityList("OIDC_USER"), idToken.build());
		return new OAuth2AuthenticationToken(user, user.getAuthorities(), "resolve");
	}

}
