package com.resolve.api.tickets;

/** Fila del feed: una entrada del historial con los datos de su ticket que el feed muestra. */
record ActivityFeedRow(TicketActivity activity, long ticketNumber, String subject) {
}
