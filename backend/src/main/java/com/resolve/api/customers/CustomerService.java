package com.resolve.api.customers;

import java.time.Clock;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.ConflictException;
import com.resolve.api.common.error.PreconditionFailedException;
import com.resolve.api.common.error.ResourceNotFoundException;
import com.resolve.api.common.persistence.Ids;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;
import com.resolve.api.common.web.Preconditions;
import com.resolve.api.customers.CustomerDtos.CustomerDetailDto;
import com.resolve.api.customers.CustomerDtos.CustomerMetricsDto;
import com.resolve.api.customers.CustomerDtos.CustomerSummaryDto;
import com.resolve.api.customers.CustomerRequestParser.CustomerChanges;
import com.resolve.api.customers.CustomerRequestParser.NewCustomer;
import org.jspecify.annotations.Nullable;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Casos de uso de clientes. Toda lectura y escritura parte del {@link CurrentMember}: la organización siempre sale
 * del principal y un cliente ajeno responde igual que uno inexistente (404).
 */
@Service
class CustomerService {

	private static final String DUPLICATE_EMAIL = "Ya existe un cliente con este correo.";

	private final CustomerRepository customers;

	private final CustomerMetricsQuery metrics;

	private final Clock clock;

	CustomerService(CustomerRepository customers, CustomerMetricsQuery metrics, Clock clock) {
		this.customers = customers;
		this.metrics = metrics;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	PageResponse<CustomerSummaryDto> list(CurrentMember member, CustomerFilters filters,
			PageQuery<CustomerSortField> page) {
		return this.customers.search(member.organizationId(), filters, page).map(CustomerSummaryDto::from);
	}

	@Transactional(readOnly = true)
	CustomerMetricsDto metrics(CurrentMember member) {
		return this.metrics.compute(member.organizationId());
	}

	@Transactional(readOnly = true)
	List<String> companies(CurrentMember member) {
		return this.metrics.companies(member.organizationId());
	}

	@Transactional(readOnly = true)
	CustomerDetailDto get(CurrentMember member, UUID id) {
		return detail(member, id);
	}

	@Transactional
	CustomerDetailDto create(CurrentMember member, NewCustomer request) {
		if (this.customers.emailTaken(member.organizationId(), request.email())) {
			throw new ApiValidationException("email", DUPLICATE_EMAIL);
		}
		Customer customer = new Customer(Ids.newId(), member.organizationId(), request.name(), request.email(),
				request.company(), request.notes(), this.clock.instant());
		try {
			this.customers.saveAndFlush(customer);
		}
		catch (DataIntegrityViolationException exception) {
			// Dos altas simultáneas con el mismo correo pasaron la comprobación: la segunda pierde en el índice único.
			throw new ApiValidationException("email", DUPLICATE_EMAIL);
		}
		return detail(member, customer.getId());
	}

	/**
	 * Aplica un merge-patch. Orden de errores del contrato: 404, 428, 400, 412 y 409 (401 y 403 ya los resolvió la
	 * capa de seguridad). Un patch sin cambios responde 200 sin nueva versión.
	 */
	@Transactional
	CustomerDetailDto update(CurrentMember member, UUID id, @Nullable String ifMatch,
			Supplier<CustomerChanges> body) {
		Customer customer = find(member, id);
		long expectedVersion = Preconditions.requireVersion(ifMatch, "cliente");
		CustomerChanges changes = body.get();
		if (changes.email() != null && this.customers.emailTakenByAnother(member.organizationId(), changes.email(), id)) {
			throw new ApiValidationException("email", DUPLICATE_EMAIL);
		}
		if (customer.getVersion() != expectedVersion) {
			throw new PreconditionFailedException(
					"El cliente cambió desde que lo abriste. Vuelve a cargarlo para ver los cambios.");
		}
		if (customer.getArchivedAt() != null) {
			throw new ConflictException("Restaura el cliente antes de editarlo.");
		}
		customer.edit((changes.name() != null) ? changes.name() : customer.getName(),
				(changes.email() != null) ? changes.email() : customer.getEmail(),
				changes.companyChanged() ? changes.company() : customer.getCompany(),
				changes.notesChanged() ? changes.notes() : customer.getNotes());
		// El flush dentro de la transacción hace visible la nueva versión en la respuesta y detecta carreras.
		this.customers.flush();
		return detail(member, id);
	}

	/** Archiva un cliente. No toca sus tickets; su acceso al portal deja de resolverse mientras esté archivado. */
	@Transactional
	CustomerDetailDto archive(CurrentMember member, UUID id) {
		Customer customer = find(member, id);
		if (!customer.archive(this.clock.instant())) {
			throw new ConflictException("El cliente ya está archivado.");
		}
		this.customers.flush();
		return detail(member, id);
	}

	@Transactional
	CustomerDetailDto restore(CurrentMember member, UUID id) {
		Customer customer = find(member, id);
		if (!customer.restore()) {
			throw new ConflictException("El cliente no está archivado.");
		}
		this.customers.flush();
		return detail(member, id);
	}

	private Customer find(CurrentMember member, UUID id) {
		return this.customers.findByOrganizationIdAndId(member.organizationId(), id)
			.orElseThrow(() -> new ResourceNotFoundException("No existe el cliente."));
	}

	private CustomerDetailDto detail(CurrentMember member, UUID id) {
		CustomerRow row = this.customers.findWithCounts(member.organizationId(), id)
			.orElseThrow(() -> new ResourceNotFoundException("No existe el cliente."));
		PortalAccess access = this.customers.hasPortalAccess(member.organizationId(), id) ? PortalAccess.ACTIVE
				: PortalAccess.NONE;
		return CustomerDetailDto.from(row, access);
	}

}
