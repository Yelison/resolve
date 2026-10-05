package com.resolve.api.common.error;

import java.sql.SQLException;
import java.util.List;

import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** Traduce las excepciones de la API a Problem Details (RFC 9457). */
@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {

	/** SQLSTATE 22021: secuencia de bytes no válida para la codificación (el byte 0 en un texto). */
	private static final String INVALID_BYTE_SEQUENCE = "22021";

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
