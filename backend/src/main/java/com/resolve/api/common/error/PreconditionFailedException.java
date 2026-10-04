package com.resolve.api.common.error;

/** La versión enviada en If-Match ya no es la actual. */
public class PreconditionFailedException extends RuntimeException {

	public PreconditionFailedException(String message) {
		super(message);
	}

}
