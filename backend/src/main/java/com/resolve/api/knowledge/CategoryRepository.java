package com.resolve.api.knowledge;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/** Todas las consultas reciben la organización del principal; no existe una búsqueda solo por id. */
public interface CategoryRepository extends JpaRepository<Category, UUID>, CategorySearch {

	Optional<Category> findByOrganizationIdAndId(UUID organizationId, UUID id);

	boolean existsByOrganizationIdAndSlug(UUID organizationId, String slug);

}
