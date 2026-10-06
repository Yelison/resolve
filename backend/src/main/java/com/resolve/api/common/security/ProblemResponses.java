package com.resolve.api.common.security;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import com.resolve.api.common.error.ProblemTypes;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.csrf.CsrfException;
import tools.jackson.databind.json.JsonMapper;

/** Respuestas 401 y 403 de la capa de seguridad con el mismo formato Problem Details que el resto de la API. */
class ProblemResponses {

	private static final String ABOUT_BLANK = "about:blank";

	private final JsonMapper jsonMapper;

	ProblemResponses(JsonMapper jsonMapper) {
		this.jsonMapper = jsonMapper;
	}

	void unauthorized(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
			throws IOException {
		if (Boolean.TRUE.equals(request.getAttribute(PrincipalResolver.DEACTIVATED_ATTRIBUTE))) {
			write(request, response, HttpStatus.UNAUTHORIZED, ProblemTypes.ACCESS_DEACTIVATED, "No autenticado",
					"Tu acceso a esta organización fue desactivado");
		}
		else if (Boolean.TRUE.equals(request.getAttribute(PrincipalResolver.NO_MEMBERSHIP_ATTRIBUTE))) {
			write(request, response, HttpStatus.UNAUTHORIZED, ProblemTypes.NO_MEMBERSHIP, "No autenticado",
					"Esta cuenta no tiene acceso a ninguna organización de Resolve.");
		}
		else {
			write(request, response, HttpStatus.UNAUTHORIZED, ABOUT_BLANK, "No autenticado",
					"Inicia sesión para usar la API.");
		}
	}

	void forbidden(HttpServletRequest request, HttpServletResponse response, AccessDeniedException exception)
			throws IOException {
		// Un token CSRF ausente o inválido no tiene que ver con el rol: el cliente debe saber que reintentar con el
		// token (o recargar para recibir la cookie) lo arregla.
		if (exception instanceof CsrfException) {
			write(request, response, HttpStatus.FORBIDDEN, ProblemTypes.CSRF, "Sin permiso",
					"Falta el token CSRF o no es válido.");
		}
		else {
			write(request, response, HttpStatus.FORBIDDEN, ABOUT_BLANK, "Sin permiso", "Tu rol no permite esta acción.");
		}
	}

	/** 409: la organización que la pantalla muestra no es la de la sesión; no se ha tocado nada. */
	void organizationMismatch(HttpServletRequest request, HttpServletResponse response) throws IOException {
		write(request, response, HttpStatus.CONFLICT, ProblemTypes.ORGANIZATION_MISMATCH, "La organización cambió",
				"La organización que ves ya no es la de tu sesión. Lo que ibas a enviar no se envió: revisa lo que ves y repítelo.");
	}

	/** 400: la cabecera de la organización no es un identificador. */
	void badOrganizationHeader(HttpServletRequest request, HttpServletResponse response, String header)
			throws IOException {
		write(request, response, HttpStatus.BAD_REQUEST, ABOUT_BLANK, "Petición no válida",
				"La cabecera " + header + " no es un identificador válido.");
	}

	private void write(HttpServletRequest request, HttpServletResponse response, HttpStatus status, String type,
			String title, String detail) throws IOException {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("type", type);
		body.put("title", title);
		body.put("status", status.value());
		body.put("detail", detail);
		body.put("instance", request.getRequestURI());
		response.setStatus(status.value());
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.setCharacterEncoding("UTF-8");
		this.jsonMapper.writeValue(response.getOutputStream(), body);
	}

}
