package com.resolve.api.common.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** El 409 de {@link DemoLimitException} con el mismo formato Problem Details que el resto de la API. */
@RestControllerAdvice
class DemoLimitAdvice {

	@ExceptionHandler
	ProblemDetail handle(DemoLimitException exception) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, exception.getMessage());
		problem.setTitle("Límite de la demostración");
		return problem;
	}

}
