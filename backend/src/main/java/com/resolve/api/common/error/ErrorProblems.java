package com.resolve.api.common.error;

import org.springframework.http.HttpStatusCode;

/** Título y detalle, en español y sin datos internos, de los problemas que no vienen de una regla de negocio. */
final class ErrorProblems {

	private ErrorProblems() {
	}

	static String title(HttpStatusCode status) {
		return switch (status.value()) {
			case 400 -> "Petición no válida";
			case 401 -> "No autenticado";
			case 403 -> "Sin permiso";
			case 404 -> "No encontrado";
			case 405 -> "Método no permitido";
			case 406 -> "Formato no disponible";
			case 413 -> "Petición demasiado grande";
			case 415 -> "Tipo de contenido no admitido";
			case 503 -> "Servicio no disponible";
			default -> status.is5xxServerError() ? "Error interno" : "Petición no válida";
		};
	}

	static String detail(HttpStatusCode status) {
		return switch (status.value()) {
			case 401 -> "Inicia sesión para usar la API.";
			case 403 -> "Tu rol no permite esta acción.";
			case 404 -> "No existe el recurso solicitado.";
			case 405 -> "Esta ruta no admite ese método.";
			case 503 -> "El servicio no está disponible ahora. Inténtalo de nuevo en unos segundos.";
			default -> status.is5xxServerError() ? "Algo salió mal en el servidor. Inténtalo de nuevo más tarde."
					: "No se pudo procesar la petición.";
		};
	}

}
