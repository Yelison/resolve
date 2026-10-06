package com.resolve.api.common.error;

import java.net.URI;
import java.net.URISyntaxException;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.webmvc.error.ErrorController;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;

/**
 * Destino de las redirecciones de error del contenedor ({@code spring.web.error.path}): lo que no llegó a un
 * controlador, como una ruta de la API sin manejador o una excepción de un filtro, responde igual que el resto de la
 * API, con Problem Details ({@link ApiExceptionHandler}), sea cual sea la cabecera {@code Accept}.
 *
 * <p>
 * Sustituye al {@code BasicErrorController} de Spring Boot, que respondía su propio JSON o una página HTML genérica. No
 * devuelve el mensaje ni la excepción originales: pueden contener detalles internos. Los 5xx se registran con la URI
 * original, que es la que el cliente ve en el {@code instance} del problema.
 *
 * <p>
 * Como todo controlador de {@code com.resolve.api}, {@code ApiPathPrefix} le antepone {@code /api}: la ruta es
 * {@code /api/error}, la misma que lee Spring Boot.
 */
@Controller
class ProblemErrorController implements ErrorController {

	private static final Logger log = LoggerFactory.getLogger(ProblemErrorController.class);

	@RequestMapping("/error")
	ResponseEntity<ProblemDetail> error(HttpServletRequest request) {
		HttpStatusCode status = status(request);
		String instance = (String) request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI);
		if (status.is5xxServerError()) {
			log.error("Request failed with status {} on {}", status.value(), instance,
					(Throwable) request.getAttribute(RequestDispatcher.ERROR_EXCEPTION));
		}
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, ErrorProblems.detail(status));
		problem.setTitle(ErrorProblems.title(status));
		problem.setInstance(instance(instance));
		return ResponseEntity.status(status).contentType(MediaType.APPLICATION_PROBLEM_JSON).body(problem);
	}

	/** Una visita directa a la ruta, sin error de por medio, es un recurso que no existe. */
	private static HttpStatusCode status(HttpServletRequest request) {
		Object code = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
		if (code instanceof Integer value && value >= 400 && value < 600) {
			return HttpStatusCode.valueOf(value);
		}
		return HttpStatus.NOT_FOUND;
	}

	/** La URI original puede traer caracteres que {@link URI} no admite: sin instancia es mejor que otro error. */
	private static @Nullable URI instance(@Nullable String requestUri) {
		if (requestUri == null) {
			return null;
		}
		try {
			return new URI(requestUri);
		}
		catch (URISyntaxException exception) {
			return null;
		}
	}

}
