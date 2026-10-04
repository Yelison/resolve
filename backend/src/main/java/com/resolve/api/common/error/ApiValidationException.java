package com.resolve.api.common.error;

import java.util.List;

/** Petición inválida: se responde 400 con la lista de campos y sus mensajes. */
public class ApiValidationException extends RuntimeException {

	private final List<FieldErrorDetail> errors;

	public ApiValidationException(List<FieldErrorDetail> errors) {
		super("La petición no es válida");
		this.errors = List.copyOf(errors);
	}

	public ApiValidationException(String field, String message) {
		this(List.of(new FieldErrorDetail(field, message)));
	}

	public List<FieldErrorDetail> errors() {
		return this.errors;
	}

}
