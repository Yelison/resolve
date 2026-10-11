package com.resolve.api.customers;

import java.time.Instant;

import com.resolve.api.tickets.TicketStatus;

/** El ticket más reciente de un cliente por {@code updatedAt}; con el mismo instante gana el número más alto. */
public record LastTicket(long number, String subject, TicketStatus status, Instant updatedAt) {
}
