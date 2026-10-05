package com.resolve.api.knowledge;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

/** Todas las consultas reciben la organización del principal; no existe una búsqueda solo por id. */
public interface ArticleRepository extends JpaRepository<Article, UUID>, ArticleSearch {

	Optional<Article> findByOrganizationIdAndId(UUID organizationId, UUID id);

	/**
	 * Lectura con bloqueo de fila ({@code SELECT … FOR NO KEY UPDATE}) para las escrituras: dos publicaciones
	 * simultáneas se serializan y la segunda lee el estado ya confirmado (409), en lugar de perder en la comprobación
	 * de versión con un 412 que esas acciones no declaran.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select a from Article a where a.organizationId = :organizationId and a.slug = :slug")
	Optional<Article> lockBySlug(UUID organizationId, String slug);

	/** Los slugs de la organización que son {@code base} o empiezan por {@code prefix} ({@code base-}). */
	@Query("""
			select a.slug from Article a
			where a.organizationId = :organizationId and (a.slug = :base or a.slug like :prefix)
			""")
	Collection<String> slugsStartingWith(UUID organizationId, String base, String prefix);

}
