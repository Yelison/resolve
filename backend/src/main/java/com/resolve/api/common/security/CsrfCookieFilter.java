package com.resolve.api.common.security;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Spring difiere la carga del token CSRF y, con el manejador de atributo simple, no escribe la cookie
 * {@code XSRF-TOKEN} hasta que algo lo lee. Este filtro lo lee en cada petición, así que la primera respuesta (la de
 * {@code GET /me}, también un 401) ya trae la cookie que el cliente necesita antes de su primer {@code POST}.
 */
final class CsrfCookieFilter extends OncePerRequestFilter {

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		CsrfToken token = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
		if (token != null) {
			token.getToken();
		}
		chain.doFilter(request, response);
	}

}
