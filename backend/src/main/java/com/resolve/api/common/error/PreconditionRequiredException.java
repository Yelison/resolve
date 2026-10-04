package com.resolve.api.common.error;

/** La operación exige una precondición (If-Match) que la petición no envió. */
public class PreconditionRequiredException extends RuntimeException {

	public PreconditionRequiredException(String message) {
		super(message);
	}

}
