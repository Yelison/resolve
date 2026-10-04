package com.resolve.api.common.security;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import tools.jackson.databind.json.JsonMapper;

/** Respuestas 401 y 403 de la capa de seguridad con el mismo formato Problem Details que el resto de la API. */
class ProblemResponses {

	private final JsonMapper jsonMapper;

	ProblemResponses(JsonMapper jsonMapper) {
		this.jsonMapper = jsonMapper;
	}

	void unauthorized(HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
			throws IOException {
		write(request, response, HttpStatus.UNAUTHORIZED, "No autenticado", "Inicia sesión para usar la API.");
	}

	void forbidden(HttpServletRequest request, HttpServletResponse response, AccessDeniedException exception)
			throws IOException {
		write(request, response, HttpStatus.FORBIDDEN, "Sin permiso", "Tu rol no permite esta acción.");
	}

	private void write(HttpServletRequest request, HttpServletResponse response, HttpStatus status, String title,
			String detail) throws IOException {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("type", "about:blank");
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
