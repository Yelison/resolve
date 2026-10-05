package com.resolve.api.tickets;

import java.util.List;
import java.util.UUID;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.tickets.TicketDtos.ActivityDto;
import com.resolve.api.tickets.TicketDtos.ActivityFeedItemDto;
import org.jspecify.annotations.Nullable;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Actividad reciente de toda la organización. Solo hay historial de tickets (creación y cambios de estado, prioridad y
 * responsable): las notas internas son mensajes y no entran, así que no hay nada que filtrar por rol; el acceso del
 * personal se exige en la regla de URL.
 */
@Component
class ActivityFeedQuery {

	static final int DEFAULT_SIZE = 10;

	static final int MAX_SIZE = 50;

	private final TicketActivityRepository activities;

	ActivityFeedQuery(TicketActivityRepository activities) {
		this.activities = activities;
	}

	@Transactional(readOnly = true)
	List<ActivityFeedItemDto> latest(UUID organizationId, int size) {
		return this.activities.findFeed(organizationId, Limit.of(size))
			.stream()
			.map((row) -> new ActivityFeedItemDto(row.ticketNumber(), row.subject(), ActivityDto.from(row.activity())))
			.toList();
	}

	/** Un valor ausente o en blanco es el tamaño por defecto; cualquier otro debe ser un entero entre 1 y 50. */
	static int parseSize(@Nullable String size) {
		if (size == null || size.isBlank()) {
			return DEFAULT_SIZE;
		}
		try {
			int value = Integer.parseInt(size.trim());
			if (value >= 1 && value <= MAX_SIZE) {
				return value;
			}
		}
		catch (NumberFormatException exception) {
			// Se informa abajo, igual que un valor fuera de rango.
		}
		throw new ApiValidationException("size", "Debe ser un número entero entre 1 y " + MAX_SIZE + ".");
	}

}
