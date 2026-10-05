package com.resolve.api.knowledge;

import java.util.Optional;
import java.util.UUID;

import com.resolve.api.common.persistence.LikePatterns;
import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;
import com.resolve.api.common.web.SortDirection;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import org.jspecify.annotations.Nullable;

/**
 * Lista y búsqueda de artículos. Toda consulta parte de la organización y añade {@link ArticleScope}; el orden por
 * título ignora mayúsculas y todos los órdenes desempatan por id en la dirección del orden, que es la del índice
 * {@code articles_list_idx}.
 */
class ArticleSearchImpl implements ArticleSearch {

	private final EntityManager entityManager;

	ArticleSearchImpl(EntityManager entityManager) {
		this.entityManager = entityManager;
	}

	@Override
	public PageResponse<Article> search(UUID organizationId, boolean staff, ArticleFilters filters,
			PageQuery<ArticleSortField> page) {
		String pattern = (filters.text() == null || filters.text().isBlank()) ? null
				: LikePatterns.contains(filters.text().trim());
		String where = where(staff, pattern != null, filters);
		var items = bind(this.entityManager.createQuery(
				"select a from Article a join fetch a.category c " + where + " order by " + orderBy(page),
				Article.class), organizationId, pattern, filters)
			.setFirstResult((int) page.offset())
			.setMaxResults(page.size())
			.getResultList();
		long total = bind(this.entityManager.createQuery("select count(a) from Article a join a.category c " + where,
				Long.class), organizationId, pattern, filters)
			.getSingleResult();
		return PageResponse.of(items, page, total);
	}

	@Override
	public Optional<Article> findReadable(UUID organizationId, boolean staff, String slug) {
		return this.entityManager
			.createQuery("select a from Article a join fetch a.category join fetch a.createdBy join fetch a.updatedBy"
					+ " where a.organizationId = :organizationId and a.slug = :slug" + ArticleScope.restriction(staff),
					Article.class)
			.setParameter("organizationId", organizationId)
			.setParameter("slug", slug)
			.getResultList()
			.stream()
			.findFirst();
	}

	/** Solo añade las condiciones de los filtros presentes: un parámetro nulo de un enum no tiene tipo que inferir. */
	private static String where(boolean staff, boolean hasText, ArticleFilters filters) {
		StringBuilder where = new StringBuilder("where a.organizationId = :organizationId");
		if (hasText) {
			where.append(" and (lower(a.title) like :pattern escape '\\'")
				.append(" or lower(a.body) like :pattern escape '\\'")
				.append(" or lower(c.name) like :pattern escape '\\')");
		}
		if (filters.categorySlug() != null) {
			where.append(" and c.slug = :categorySlug");
		}
		if (filters.status() != null) {
			where.append(" and a.status = :status");
		}
		return where.append(ArticleScope.restriction(staff)).toString();
	}

	private static <T> TypedQuery<T> bind(TypedQuery<T> query, UUID organizationId, @Nullable String pattern,
			ArticleFilters filters) {
		query.setParameter("organizationId", organizationId);
		if (pattern != null) {
			query.setParameter("pattern", pattern);
		}
		if (filters.categorySlug() != null) {
			query.setParameter("categorySlug", filters.categorySlug());
		}
		if (filters.status() != null) {
			query.setParameter("status", filters.status());
		}
		return query;
	}

	private static String orderBy(PageQuery<ArticleSortField> page) {
		String direction = (page.sort().direction() == SortDirection.DESC) ? "desc" : "asc";
		String field = switch (page.sort().field()) {
			case UPDATED_AT -> "a.updatedAt";
			case TITLE -> "lower(a.title)";
		};
		return field + " " + direction + ", a.id " + direction;
	}

}
