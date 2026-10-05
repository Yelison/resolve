package com.resolve.api.common.security;

import java.io.IOException;
import java.util.Map;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.oidc.web.logout.OidcClientInitiatedLogoutSuccessHandler;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.web.authentication.logout.LogoutSuccessHandler;
import tools.jackson.databind.json.JsonMapper;

/**
 * Cierre de sesión iniciado por la aplicación (RP-initiated logout) para una API que no puede redirigir: la sesión del
 * servidor ya está invalidada cuando se ejecuta y, en lugar de un 302, responde 200 con
 * {@code {"logoutUrl": "…"}}, el {@code end_session_endpoint} del proveedor con {@code id_token_hint} y
 * {@code post_logout_redirect_uri} (la URL pública de la aplicación). El cliente navega a esa URL y así termina también
 * la sesión del proveedor. Sin sesión, o con un proveedor sin {@code end_session_endpoint}, la URL es la pública.
 *
 * <p>
 * La URL la construye {@link OidcClientInitiatedLogoutSuccessHandler}, que solo añade el token de identidad de quien
 * sale: ni el secreto del cliente, ni los tokens de acceso o refresco, ni el id de sesión.
 */
final class OidcLogoutSuccessHandler implements LogoutSuccessHandler {

	private final OidcClientInitiatedLogoutSuccessHandler delegate;

	private final JsonMapper jsonMapper;

	OidcLogoutSuccessHandler(ClientRegistrationRepository registrations, String publicUrl, JsonMapper jsonMapper) {
		this.jsonMapper = jsonMapper;
		this.delegate = new OidcClientInitiatedLogoutSuccessHandler(registrations);
		this.delegate.setPostLogoutRedirectUri(publicUrl);
		this.delegate.setDefaultTargetUrl(publicUrl);
		this.delegate.setRedirectStrategy(this::writeLogoutUrl);
	}

	@Override
	public void onLogoutSuccess(HttpServletRequest request, HttpServletResponse response,
			Authentication authentication) throws IOException, ServletException {
		this.delegate.onLogoutSuccess(request, response, authentication);
	}

	private void writeLogoutUrl(HttpServletRequest request, HttpServletResponse response, String url)
			throws IOException {
		response.setStatus(HttpServletResponse.SC_OK);
		response.setContentType(MediaType.APPLICATION_JSON_VALUE);
		response.setCharacterEncoding("UTF-8");
		this.jsonMapper.writeValue(response.getOutputStream(), Map.of("logoutUrl", url));
	}

}
