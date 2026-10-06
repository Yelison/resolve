package com.resolve.api.common.web;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * {@code X-Robots-Tag: noindex} en todas las respuestas de una demostración pública (plan §4.5-5, «Isolation»): ni la
 * aplicación web ni la API deben acabar en un buscador. Se escribe antes de seguir la cadena, así que también va en un
 * 401, un 429 o un 503 que otro filtro responda sin llegar a un controlador.
 */
@Component
@ConditionalOnProperty(name = "resolve.demo.enabled", havingValue = "true")
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
class NoIndexFilter extends OncePerRequestFilter {

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		response.setHeader("X-Robots-Tag", "noindex");
		chain.doFilter(request, response);
	}

}
