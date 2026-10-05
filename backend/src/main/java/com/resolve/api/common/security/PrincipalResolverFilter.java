package com.resolve.api.common.security;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Coloca en el contexto de seguridad el miembro que devuelva el {@link PrincipalResolver}, y solo ese. Si no devuelve
 * ninguno, el contexto de la petición queda vacío: con la sesión OIDC, la autenticación del proveedor que se cargó de
 * la sesión no puede quedarse, porque el miembro retirado, el cliente archivado o el correo sin cuenta pasarían las
 * reglas {@code authenticated()} sin un {@link CurrentMember} como principal.
 */
class PrincipalResolverFilter extends OncePerRequestFilter {

	private final PrincipalResolver resolver;

	PrincipalResolverFilter(PrincipalResolver resolver) {
		this.resolver = resolver;
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
