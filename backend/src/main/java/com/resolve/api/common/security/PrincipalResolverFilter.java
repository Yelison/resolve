package com.resolve.api.common.security;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/** Coloca en el contexto de seguridad el miembro que devuelva el {@link PrincipalResolver}. */
class PrincipalResolverFilter extends OncePerRequestFilter {

	private final PrincipalResolver resolver;

	PrincipalResolverFilter(PrincipalResolver resolver) {
		this.resolver = resolver;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		this.resolver.resolve(request).ifPresent((member) -> {
			var context = SecurityContextHolder.createEmptyContext();
			context.setAuthentication(new MemberAuthentication(member));
			SecurityContextHolder.setContext(context);
		});
		try {
			chain.doFilter(request, response);
		}
		finally {
			SecurityContextHolder.clearContext();
		}
	}

}
