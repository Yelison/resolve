package com.resolve.api.common.error;

import java.sql.SQLException;
import java.util.List;

import com.resolve.api.common.persistence.LockTimeouts;
import jakarta.servlet.http.HttpServletRequest;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Traduce las excepciones de la API a Problem Details (RFC 9457). */
@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

	/** SQLSTATE 22021: secuencia de bytes no válida para la codificación (el byte 0 en un texto). */
	private static final String INVALID_BYTE_SEQUENCE = "22021";

	/** SQLSTATE 55P03: no se obtuvo el bloqueo en el tiempo de {@code lock_timeout}. */
	private static final String LOCK_NOT_AVAILABLE = "55P03";

	@ExceptionHandler
	ProblemDetail handleValidation(ApiValidationException exception) {
		return validationProblem(exception.errors());
	}

	@ExceptionHandler
	ProblemDetail handleNotFound(ResourceNotFoundException exception) {
		return problem(HttpStatus.NOT_FOUND, "No encontrado", exception.getMessage());
	}

	@ExceptionHandler
	ProblemDetail handlePreconditionRequired(PreconditionRequiredException exception) {
		return problem(HttpStatus.PRECONDITION_REQUIRED, "Falta la precondición", exception.getMessage());
	}

	@ExceptionHandler
	ProblemDetail handlePreconditionFailed(PreconditionFailedException exception) {
		return preconditionFailed(exception.getMessage());
	}

	/** Reglas de negocio que el estado actual del recurso no permite; no es un error de versión (412). */
	@ExceptionHandler
	ProblemDetail handleConflict(ConflictException exception) {
		return problem(HttpStatus.CONFLICT, "Conflicto", exception.getMessage());
	}

	/** Dos escrituras simultáneas pasaron la comprobación de versión: la segunda pierde igual que con If-Match. */
	@ExceptionHandler
	ProblemDetail handleOptimisticLock(ObjectOptimisticLockingFailureException exception) {
		return preconditionFailed("El recurso cambió mientras se guardaba. Vuelve a cargarlo e inténtalo de nuevo.");
	}

	/**
	 * Otra transacción retenía la fila más de {@link LockTimeouts#MILLIS} ms (SQLSTATE 55P03). No es un error de
	 * versión (412) ni de negocio (409): la petición es válida y repetirla tal cual puede funcionar, que es el
	 * significado de un 503 con {@code Retry-After}.
	 *
	 * <p>
	 * Hay que mirar el SQLSTATE: por la ruta JPA un interbloqueo (40P01) llega como la misma
	 * {@link CannotAcquireLockException} (Hibernate lo traduce a {@code LockAcquisitionException}, la superclase de
	 * {@code LockTimeoutException}). Un interbloqueo no es el tope de espera ni lo declaran las operaciones que no
	 * toman el bloqueo, así que se relanza y sigue siendo un 500.
	 */
	@ExceptionHandler
	ResponseEntity<ProblemDetail> handleLockTimeout(CannotAcquireLockException exception,
			HttpServletRequest request) {
		if (!hasSqlState(exception, LOCK_NOT_AVAILABLE)) {
			throw exception;
		}
		// Un 5xx queda en el registro con la URI que el cliente ve en el «instance» del problema, para encontrarlo.
		log.warn("Request failed with status 503 on {}: lock timeout", request.getRequestURI());
		return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
			.header(HttpHeaders.RETRY_AFTER, String.valueOf(LockTimeouts.RETRY_AFTER_SECONDS))
			.contentType(MediaType.APPLICATION_PROBLEM_JSON)
			.body(problem(HttpStatus.SERVICE_UNAVAILABLE, "Recurso ocupado",
					"Otra operación está modificando este recurso. Inténtalo de nuevo en unos segundos."));
	}

	/**
	 * Red de seguridad: un texto con el byte 0 que se escapó de la validación explícita. PostgreSQL lo rechaza con
	 * SQLSTATE 22021 y es un error del cliente. Solo se traduce ese estado: otras violaciones de integridad siguen
	 * siendo un 500, porque delatan un fallo del servidor.
	 */
	@ExceptionHandler
	ResponseEntity<ProblemDetail> handleDataIntegrity(DataIntegrityViolationException exception) {
		if (!hasSqlState(exception, INVALID_BYTE_SEQUENCE)) {
			throw exception;
		}
		return ResponseEntity.badRequest()
			.contentType(MediaType.APPLICATION_PROBLEM_JSON)
			.body(problem(HttpStatus.BAD_REQUEST, "Petición no válida", "La petición contiene caracteres que no se pueden guardar."));
	}

	private static boolean hasSqlState(Throwable exception, String sqlState) {
		for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
			if (cause instanceof SQLException sql && sqlState.equals(sql.getSQLState())) {
				return true;
			}
			if (cause.getCause() == cause) {
				break;
			}
		}
		return false;
	}

	/**
	 * Todo lo que resuelve {@link ResponseEntityExceptionHandler} pasa por aquí. Un 5xx se registra con la URI que el
	 * cliente ve en el {@code instance} (Spring solo escribe algo si la respuesta ya estaba comprometida) y, junto con el
	 * 405, sale con el título y el detalle en español de {@link ErrorProblems} en lugar de los de Spring («Method Not
	 * Allowed», «Failed to write request»). La cabecera {@code Allow} del 405 se conserva. Los 400 no se tocan: sus
	 * {@code detail} los fija el contrato.
	 */
	@Override
	protected @Nullable ResponseEntity<Object> handleExceptionInternal(Exception exception, @Nullable Object body,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		ResponseEntity<Object> response = super.handleExceptionInternal(exception, body, headers, status, request);
		boolean serverError = status.is5xxServerError();
		if (response != null && response.getBody() instanceof ProblemDetail problem
				&& (serverError || status.value() == HttpStatus.METHOD_NOT_ALLOWED.value())) {
			problem.setTitle(ErrorProblems.title(status));
			problem.setDetail(ErrorProblems.detail(status));
		}
		if (serverError) {
			String uri = (request instanceof ServletWebRequest servlet) ? servlet.getRequest().getRequestURI() : "?";
			log.error("Request failed with status {} on {}", status.value(), uri, exception);
		}
		return response;
	}

	/**
	 * Una ruta de la API sin manejador. Spring la responde con «Not Found» y el detalle «No static resource …», que sale
	 * del manejador de recursos de la aplicación web y no dice nada útil: el mismo problema que cualquier 404.
	 */
	@Override
	protected @Nullable ResponseEntity<Object> handleNoResourceFoundException(NoResourceFoundException exception,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		return ResponseEntity.status(status)
			.headers(headers)
			.contentType(MediaType.APPLICATION_PROBLEM_JSON)
			.body(problem(HttpStatus.NOT_FOUND, ErrorProblems.title(status), ErrorProblems.detail(status)));
	}

	@Override
	protected @Nullable ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException exception,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		List<FieldErrorDetail> errors = exception.getBindingResult()
			.getFieldErrors()
			.stream()
			.map((error) -> new FieldErrorDetail(error.getField(), String.valueOf(error.getDefaultMessage())))
			.toList();
		return ResponseEntity.badRequest().body(validationProblem(errors));
	}

	static ProblemDetail validationProblem(List<FieldErrorDetail> errors) {
		ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "Petición no válida", "Revisa los campos indicados.");
		problem.setProperty("errors", errors);
		return problem;
	}

	private static ProblemDetail preconditionFailed(String detail) {
		return problem(HttpStatus.PRECONDITION_FAILED, "El recurso cambió", detail);
	}

	private static ProblemDetail problem(HttpStatus status, String title, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setTitle(title);
		return problem;
	}

}
