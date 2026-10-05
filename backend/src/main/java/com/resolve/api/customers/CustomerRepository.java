package com.resolve.api.customers;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** Todas las consultas reciben la organización del principal; no existe una búsqueda solo por id. */
public interface CustomerRepository extends JpaRepository<Customer, UUID>, CustomerSearch {

	Optional<Customer> findByOrganizationIdAndId(UUID organizationId, UUID id);

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
