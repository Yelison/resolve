package com.resolve.api.common.web;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import tools.jackson.databind.json.JsonMapper;

/**
 * Respuestas Problem Details de los filtros de servlet de este paquete. Un filtro responde antes de que exista un
 * controlador, así que no puede lanzar una excepción que {@code ApiExceptionHandler} convierta: escribe el mismo
 * cuerpo ({@code type}, {@code title}, {@code status}, {@code detail}, {@code instance}) a mano.
 */
final class FilterProblems {

	private FilterProblems() {
	}

	static void write(JsonMapper jsonMapper, HttpServletRequest request, HttpServletResponse response,
			HttpStatus status, String title, String detail) throws IOException {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("type", "about:blank");
		body.put("title", title);
		body.put("status", status.value());
		body.put("detail", detail);
		body.put("instance", request.getRequestURI());
		response.setStatus(status.value());
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.setCharacterEncoding("UTF-8");
		jsonMapper.writeValue(response.getOutputStream(), body);
	}

	/** {@code true} para {@code /api} y todo lo que cuelga de él. */
	static boolean isApi(HttpServletRequest request) {
		String path = request.getRequestURI();
		return path.equals(ApiPathPrefix.PATH) || path.startsWith(ApiPathPrefix.PATH + "/");
	}

}
