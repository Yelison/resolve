package com.resolve.api.common.security;

import java.io.IOException;

import com.resolve.api.common.web.ApiPathPrefix;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Spring difiere la carga del token CSRF y, con el manejador de atributo simple, no escribe la cookie
 * {@code XSRF-TOKEN} hasta que algo lo lee. Este filtro lo lee en cada petición a la API, así que la primera respuesta
 * (la de {@code GET /api/me}, también un 401) ya trae la cookie que el cliente necesita antes de su primer
 * {@code POST}.
 *
 * <p>
 * Solo bajo {@link ApiPathPrefix#PATH}: la aplicación web (el {@code index.html} y sobre todo los archivos con hash de
 * {@code /assets}, de caché pública e inmutable) no lleva {@code Set-Cookie}. Una caché compartida guardaría la cookie
 * junto al archivo y serviría el mismo token a todo el mundo.
 */
final class CsrfCookieFilter extends OncePerRequestFilter {

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		String path = request.getRequestURI();
		return !(path.equals(ApiPathPrefix.PATH) || path.startsWith(ApiPathPrefix.PATH + "/"));
	}

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
