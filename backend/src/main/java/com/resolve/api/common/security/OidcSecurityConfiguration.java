package com.resolve.api.common.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.client.web.HttpSessionOAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.web.authentication.logout.HttpStatusReturningLogoutSuccessHandler;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

/**
 * Patrón BFF con OpenID Connect (perfil {@code oidc}): el backend hace el flujo de código de autorización con PKCE
 * contra el proveedor, guarda los tokens en el servidor y entrega al navegador solo una cookie de sesión.
 */
@Configuration(proxyBeanMethods = false)
@Profile("oidc")
class OidcSecurityConfiguration {

	/**
	 * Los tokens del cliente OIDC (acceso y refresco) se guardan en la sesión HTTP y mueren con ella. El valor por
	 * defecto de Spring Boot los dejaría en un servicio en memoria, por usuario, que sobrevive a la sesión invalidada.
	 */
	@Bean
	OAuth2AuthorizedClientRepository authorizedClientRepository() {
		return new HttpSessionOAuth2AuthorizedClientRepository();
	}

	/** Sesión en el servidor, CSRF por cookie y cabecera, inicio de sesión OIDC y cierre de sesión con 204. */
	@Bean
	HttpSecurityCustomizer oidcSecurity(@Value("${resolve.public-url}") String publicUrl) {
		String appUrl = publicUrl.replaceAll("/+$", "");
		// La cookie la lee JavaScript (por eso no es HttpOnly) en todo el sitio, no solo bajo /api.
		CookieCsrfTokenRepository csrfTokens = CookieCsrfTokenRepository.withHttpOnlyFalse();
		csrfTokens.setCookiePath("/");
		csrfTokens.setCookieCustomizer((cookie) -> cookie.sameSite("Lax"));
		return (http) -> http
			.sessionManagement((session) -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
			// El manejador simple compara el valor tal cual está en la cookie, que es lo que la aplicación web reenvía.
			.csrf((csrf) -> csrf.csrfTokenRepository(csrfTokens)
				.csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
			.addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class)
			// PKCE lo envía Spring Security 7 por defecto, también a clientes confidenciales; el realm lo exige. El punto
			// de entrada de la cadena sigue siendo el de Problem Details, que prevalece sobre la redirección de oauth2Login.
			.oauth2Login((login) -> login.defaultSuccessUrl(appUrl, true)
				.failureHandler((request, response, exception) -> response.sendRedirect(appUrl + "/entrar?error=oidc")))
			.logout((logout) -> logout.logoutUrl("/logout")
				.invalidateHttpSession(true)
				.logoutSuccessHandler(new HttpStatusReturningLogoutSuccessHandler(HttpStatus.NO_CONTENT)));
	}

}
