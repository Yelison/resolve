package com.resolve.api.customers;

/** Un cliente con sus recuentos de tickets, tal como lo devuelven las consultas de lista y detalle. */
public record CustomerRow(Customer customer, long openTickets, long totalTickets) {
}
