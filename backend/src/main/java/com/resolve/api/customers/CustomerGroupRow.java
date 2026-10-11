package com.resolve.api.customers;

import java.util.List;

import org.jspecify.annotations.Nullable;

/** Una empresa de la página con los totales de todos sus clientes y los primeros de ellos; sin empresa, {@code company} es {@code null}. */
public record CustomerGroupRow(@Nullable String company, long customerCount, long openTickets,
		List<CustomerRow> customers) {
}
