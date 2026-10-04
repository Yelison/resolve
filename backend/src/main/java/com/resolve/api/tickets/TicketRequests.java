package com.resolve.api.tickets;

import org.jspecify.annotations.Nullable;

/**
 * Cuerpos de petición. Los campos llegan como texto y se validan en {@link TicketRequestParser}, para responder con
 * errores por campo coherentes. Los campos desconocidos (p. ej. un {@code organizationId}) devuelven 400 por la
 * configuración global de Jackson.
 */
final class TicketRequests {

	private TicketRequests() {
	}

	record CreateTicket(@Nullable String customerId, @Nullable String subject, @Nullable String description,
			@Nullable String priority, @Nullable String channel, @Nullable String assigneeId) {
	}

	record CreateMessage(@Nullable String body, @Nullable String visibility) {
	}

}
