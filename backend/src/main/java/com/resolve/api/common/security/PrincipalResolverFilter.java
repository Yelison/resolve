package com.resolve.api.common.security;

import java.io.IOException;

import com.resolve.api.common.web.ApiPathPrefix;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Coloca en el contexto de seguridad el miembro que devuelva el {@link PrincipalResolver}, y solo ese. Si no devuelve
 * ninguno, el contexto de la petición queda vacío: con la sesión OIDC, la autenticación del proveedor que se cargó de
 * la sesión no puede quedarse, porque el miembro retirado, el cliente archivado o el correo sin cuenta pasarían las
 * reglas {@code authenticated()} sin un {@link CurrentMember} como principal.
 *
 * <p>
 * Solo actúa bajo el prefijo de la API: la aplicación web se sirve desde la misma aplicación y cada archivo estático
 * costaría una consulta a la base de datos para resolver a alguien que esas rutas no usan.
 */
class PrincipalResolverFilter extends OncePerRequestFilter {

	private static final RequestMatcher API = PathPatternRequestMatcher.withDefaults().matcher(ApiPathPrefix.of("/**"));

	private final PrincipalResolver resolver;

	PrincipalResolverFilter(PrincipalResolver resolver) {
		this.resolver = resolver;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		return !API.matches(request);
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		SecurityContext context = SecurityContextHolder.createEmptyContext();
		this.resolver.resolve(request).ifPresent((member) -> context.setAuthentication(new MemberAuthentication(member)));
		SecurityContextHolder.setContext(context);
		try {
			chain.doFilter(request, response);
		}
		finally {
			SecurityContextHolder.clearContext();
		}
	}

}
