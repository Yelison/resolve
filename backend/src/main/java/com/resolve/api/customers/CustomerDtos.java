package com.resolve.api.customers;

import java.time.Instant;
import java.util.UUID;

import org.jspecify.annotations.Nullable;

/** Representaciones de la API de clientes. {@link CustomerDto} es la referencia reducida que incrustan los tickets. */
public final class CustomerDtos {

	private CustomerDtos() {
	}

	/** Fila de las listas, con los recuentos de tickets del cliente. */
	public record CustomerSummaryDto(UUID id, String name, String email, @Nullable String company, long openTickets,
			long totalTickets, Instant createdAt, boolean archived) {

		static CustomerSummaryDto from(CustomerRow row) {
			Customer customer = row.customer();
			return new CustomerSummaryDto(customer.getId(), customer.getName(), customer.getEmail(),
					customer.getCompany(), row.openTickets(), row.totalTickets(), customer.getCreatedAt(),
					customer.getArchivedAt() != null);
		}

	}

	/** Detalle de un cliente: los campos de {@link CustomerSummaryDto} más perfil, versión y acceso al portal. */
	public record CustomerDetailDto(UUID id, String name, String email, @Nullable String company, long openTickets,
			long totalTickets, Instant createdAt, boolean archived, @Nullable String notes,
			@Nullable Instant archivedAt, long version, PortalAccess portalAccess) {

		static CustomerDetailDto from(CustomerRow row, PortalAccess portalAccess) {
			Customer customer = row.customer();
			return new CustomerDetailDto(customer.getId(), customer.getName(), customer.getEmail(),
					customer.getCompany(), row.openTickets(), row.totalTickets(), customer.getCreatedAt(),
					customer.getArchivedAt() != null, customer.getNotes(), customer.getArchivedAt(),
					customer.getVersion(), portalAccess);
		}

	}

	/** Métricas de los clientes activos de la organización ({@code CustomerMetrics} en el contrato). */
	public record CustomerMetricsDto(int total, int companies, int withOpenTickets, int newThisMonth) {
	}

}
