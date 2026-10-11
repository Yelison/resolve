package com.resolve.api.customers;

import org.jspecify.annotations.Nullable;

/**
 * Un cliente con sus recuentos de tickets, tal como lo devuelven las consultas de lista y detalle. {@code lastTicket}
 * solo lo rellena la lista; sin ticket, y en el detalle (que no lo muestra), es {@code null}.
 */
public record CustomerRow(Customer customer, long openTickets, long totalTickets, @Nullable LastTicket lastTicket) {

	public CustomerRow(Customer customer, long openTickets, long totalTickets) {
		this(customer, openTickets, totalTickets, null);
	}

	CustomerRow withLastTicket(@Nullable LastTicket lastTicket) {
		return new CustomerRow(this.customer, this.openTickets, this.totalTickets, lastTicket);
	}

}
