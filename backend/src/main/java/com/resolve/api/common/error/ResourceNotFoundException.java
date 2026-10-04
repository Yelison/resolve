package com.resolve.api.common.error;

/** El recurso no existe en el ámbito del usuario. Nunca distingue «ajeno» de «inexistente». */
public class ResourceNotFoundException extends RuntimeException {

	public ResourceNotFoundException(String message) {
		super(message);
	}

}
