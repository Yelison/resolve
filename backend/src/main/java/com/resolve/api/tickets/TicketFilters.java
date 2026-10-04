package com.resolve.api.tickets;

import java.util.Set;
import java.util.UUID;

import org.jspecify.annotations.Nullable;

/**
 * Filtros ya validados de la bandeja. Se combinan con AND; los valores repetidos de un filtro, con OR.
 * @param assignee responsable concreto, {@link AssigneeFilter#none()} para sin asignar o {@code null} para todos
 * @param ticketNumber número exacto si la búsqueda es un número (con o sin #)
 * @param text texto a buscar en asunto y cliente si la búsqueda no es un número
 */
record TicketFilters(TicketView view, Set<TicketStatus> statuses, Set<TicketPriority> priorities,
		@Nullable AssigneeFilter assignee, @Nullable Long ticketNumber, @Nullable String text) {

	record AssigneeFilter(@Nullable UUID userId) {

		static AssigneeFilter none() {
			return new AssigneeFilter(null);
		}

	}

}
