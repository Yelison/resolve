package com.resolve.api.common.web;

/** Una organización llegó a uno de los topes de la demostración pública (409 «Límite de la demostración»). */
public class DemoLimitException extends RuntimeException {

	DemoLimitException(String message) {
		super(message);
	}

}
