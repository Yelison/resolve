package com.resolve.api.customers;

import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

/** Todas las consultas reciben la organización del principal; no existe una búsqueda solo por id. */
public interface CustomerRepository extends JpaRepository<Customer, UUID>, CustomerSearch {

	Optional<Customer> findByOrganizationIdAndId(UUID organizationId, UUID id);

	/**
	 * Lectura con bloqueo de fila ({@code SELECT … FOR NO KEY UPDATE}) para las escrituras: dos archivados o
	 * restauraciones simultáneos se serializan y el segundo lee el estado ya confirmado (409), en lugar de perder
	 * en la comprobación de versión con un 412 que esas acciones no declaran.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select c from Customer c where c.organizationId = :organizationId and c.id = :id")
	Optional<Customer> lockInOrganization(UUID organizationId, UUID id);

	boolean existsByIdAndArchivedAtIsNotNull(UUID id);

	/** El correo es único por organización sin distinguir mayúsculas, también entre archivados. */
	@Query("""
			select count(c) > 0 from Customer c
			where c.organizationId = :organizationId and lower(c.email) = lower(:email)
			""")
	boolean emailTaken(UUID organizationId, String email);

	/** Igual que {@link #emailTaken} pero ignorando al propio cliente, para ediciones. */
	@Query("""
			select count(c) > 0 from Customer c
			where c.organizationId = :organizationId and lower(c.email) = lower(:email) and c.id <> :excludedId
			""")
	boolean emailTakenByAnother(UUID organizationId, String email, UUID excludedId);

	/** Hasta que existan estados de invitación (T3.1), tener una membresía de cliente es tener acceso activo. */
	@Query("""
			select count(m) > 0 from Membership m
			where m.organization.id = :organizationId and m.customerId = :customerId
			""")
	boolean hasPortalAccess(UUID organizationId, UUID customerId);

}
