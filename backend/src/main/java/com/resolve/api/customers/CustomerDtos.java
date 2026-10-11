package com.resolve.api.customers;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.jspecify.annotations.Nullable;

/** Representaciones de la API de clientes. {@link CustomerDto} es la referencia reducida que incrustan los tickets. */
public final class CustomerDtos {

	private CustomerDtos() {
	}

	/** Fila de las listas, con los recuentos de tickets del cliente y su ticket más reciente ({@code null} sin tickets). */
	public record CustomerSummaryDto(UUID id, String name, String email, @Nullable String company, long openTickets,
			long totalTickets, Instant createdAt, boolean archived, @Nullable LastTicket lastTicket) {

		static CustomerSummaryDto from(CustomerRow row) {
			Customer customer = row.customer();
			return new CustomerSummaryDto(customer.getId(), customer.getName(), customer.getEmail(),
					customer.getCompany(), row.openTickets(), row.totalTickets(), customer.getCreatedAt(),
					customer.getArchivedAt() != null, row.lastTicket());
		}

	}

	/** Una empresa con los totales de sus clientes y una vista previa de los primeros ({@code /customers/by-company}). */
	public record CustomerCompanyGroupDto(@Nullable String company, long customerCount, long openTickets,
			List<CustomerSummaryDto> customers) {

		static CustomerCompanyGroupDto from(CustomerGroupRow row) {
			return new CustomerCompanyGroupDto(row.company(), row.customerCount(), row.openTickets(),
					row.customers().stream().map(CustomerSummaryDto::from).toList());
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
