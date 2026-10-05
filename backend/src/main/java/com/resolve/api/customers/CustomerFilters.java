package com.resolve.api.customers;

import org.jspecify.annotations.Nullable;

/**
 * Filtros de la lista de clientes. {@code company} se compara por igualdad sin distinguir mayúsculas; {@code archived}
 * elige entre activos (por defecto) y solo archivados.
 */
public record CustomerFilters(@Nullable String text, @Nullable String company, boolean archived) {

	public static final CustomerFilters ACTIVE = new CustomerFilters(null, null, false);

}
