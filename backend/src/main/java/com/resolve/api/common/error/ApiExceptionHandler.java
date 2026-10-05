package com.resolve.api.common.error;

import java.util.List;

import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** Traduce las excepciones de la API a Problem Details (RFC 9457). */
@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {

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
