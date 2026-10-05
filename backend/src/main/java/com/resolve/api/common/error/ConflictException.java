package com.resolve.api.common.error;

/** La acción no está permitida en el estado actual del recurso (409): archivar dos veces, editar un archivado… */
public class ConflictException extends RuntimeException {

	public ConflictException(String message) {
		super(message);
	}

}
