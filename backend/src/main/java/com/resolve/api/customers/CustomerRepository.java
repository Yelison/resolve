package com.resolve.api.customers;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/** Todas las consultas reciben la organización del principal; no existe una búsqueda solo por id. */
public interface CustomerRepository extends JpaRepository<Customer, UUID>, CustomerSearch {

	Optional<Customer> findByOrganizationIdAndId(UUID organizationId, UUID id);

}
