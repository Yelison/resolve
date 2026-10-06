package com.resolve.api.common.web;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.json.JsonMapper;

/**
 * Mientras {@link MaintenanceMode} está activo, todo lo de {@code /api} responde 503 Problem «Reinicio de la
 * demostración en curso» con {@code Retry-After}. Las sondas de salud ({@code /api/actuator/health/**}) pasan: son lo
 * que dice a la plataforma que no enrute (readiness {@code OUT_OF_SERVICE}) y que la aplicación sigue viva (liveness).
 * La aplicación web estática no se toca. Va antes de la cadena de seguridad, así que el 503 no depende de la sesión.
 */
@Component
@ConditionalOnProperty(name = "resolve.demo.enabled", havingValue = "true")
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
class MaintenanceFilter extends OncePerRequestFilter {

	private static final String HEALTH = ApiPathPrefix.of("/actuator/health");

	private final MaintenanceMode mode;

	private final JsonMapper jsonMapper;

	MaintenanceFilter(MaintenanceMode mode, JsonMapper jsonMapper) {
		this.mode = mode;
		this.jsonMapper = jsonMapper;
	}

	@Override
	protected boolean shouldNotFilter(HttpServletRequest request) {
		String path = request.getRequestURI();
		return !FilterProblems.isApi(request) || path.equals(HEALTH) || path.startsWith(HEALTH + "/");
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		if (!this.mode.active()) {
			chain.doFilter(request, response);
			return;
		}
		response.setHeader("Retry-After", Long.toString(this.mode.remaining().toSeconds()));
		FilterProblems.write(this.jsonMapper, request, response, HttpStatus.SERVICE_UNAVAILABLE,
				"Reinicio de la demostración en curso",
				"Los datos de la demostración se están reiniciando. Vuelve a intentarlo en un minuto.");
	}

}
