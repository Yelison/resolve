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
import org.hibernate.exception.ConstraintViolationException;
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

	private static final String EMAIL_CONSTRAINT = "customers_organization_email_key";

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
		this.customers.save(customer);
		flushUniqueEmail();
		return detail(member, customer.getId());
	}

	/**
	 * Aplica un merge-patch. Orden de errores del contrato: 404, 428, 400, 412 y 409 (401 y 403 ya los resolvió la
	 * capa de seguridad). Un patch sin cambios responde 200 sin nueva versión.
	 */
	@Transactional
	CustomerDetailDto update(CurrentMember member, UUID id, @Nullable String ifMatch,
			Supplier<CustomerChanges> body) {
		Customer customer = findForUpdate(member, id);
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
		flushUniqueEmail();
		return detail(member, id);
	}

	/** Archiva un cliente. No toca sus tickets; su acceso al portal deja de resolverse mientras esté archivado. */
	@Transactional
	CustomerDetailDto archive(CurrentMember member, UUID id) {
		Customer customer = findForUpdate(member, id);
		if (!customer.archive(this.clock.instant())) {
			throw new ConflictException("El cliente ya está archivado.");
		}
		this.customers.flush();
		return detail(member, id);
	}

	@Transactional
	CustomerDetailDto restore(CurrentMember member, UUID id) {
		Customer customer = findForUpdate(member, id);
		if (!customer.restore()) {
			throw new ConflictException("El cliente no está archivado.");
		}
		this.customers.flush();
		return detail(member, id);
	}

	/**
	 * Traduce a error del campo {@code email} solo la violación del índice único del correo (dos escrituras
	 * simultáneas pasaron la comprobación y la segunda pierde); cualquier otro error de integridad se relanza.
	 */
	private void flushUniqueEmail() {
		try {
			this.customers.flush();
		}
		catch (DataIntegrityViolationException exception) {
			if (!violatesUniqueEmail(exception)) {
				throw exception;
			}
			throw new ApiValidationException("email", DUPLICATE_EMAIL);
		}
	}

	private static boolean violatesUniqueEmail(Throwable exception) {
		for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
			if (cause instanceof ConstraintViolationException violation
					&& EMAIL_CONSTRAINT.equalsIgnoreCase(violation.getConstraintName())) {
				return true;
			}
		}
		return false;
	}

	/** Carga el cliente con la fila bloqueada hasta el commit; uno ajeno o inexistente responde 404. */
	private Customer findForUpdate(CurrentMember member, UUID id) {
		return this.customers.lockInOrganization(member.organizationId(), id)
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
