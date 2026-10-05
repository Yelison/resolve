package com.resolve.api.organizations;

import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface OrganizationRepository extends JpaRepository<Organization, UUID> {

	/**
	 * Lectura con bloqueo de fila ({@code SELECT … FOR NO KEY UPDATE}) para editar los ajustes: dos ediciones con la
	 * misma versión se serializan y la segunda recibe el 412 explícito en lugar de un fallo del bloqueo optimista.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select o from Organization o where o.id = :id")
	Optional<Organization> lockById(UUID id);

}
