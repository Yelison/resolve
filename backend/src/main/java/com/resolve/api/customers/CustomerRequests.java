package com.resolve.api.customers;

import org.jspecify.annotations.Nullable;

/**
 * Cuerpo de alta. Los campos llegan como texto y se validan en {@link CustomerRequestParser}; los campos
 * desconocidos (p. ej. un {@code organizationId}) devuelven 400 por la configuración global de Jackson.
 */
final class CustomerRequests {

	private CustomerRequests() {
	}

	record CreateCustomer(@Nullable String name, @Nullable String email, @Nullable String company,
			@Nullable String notes) {
	}

}
