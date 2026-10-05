package com.resolve.api.knowledge;

import java.util.List;
import java.util.UUID;

import jakarta.persistence.EntityManager;

class CategorySearchImpl implements CategorySearch {

	private final EntityManager entityManager;

	CategorySearchImpl(EntityManager entityManager) {
		this.entityManager = entityManager;
	}

	@Override
	public List<CategoryRow> listWithCounts(UUID organizationId, boolean staff) {
		// El recuento filtra también por organización: así usa articles_category_idx (organization_id, category_id).
		String query = "select c, (select count(a) from Article a where a.organizationId = c.organizationId"
				+ " and a.category = c" + ArticleScope.restriction(staff) + ") "
				+ "from Category c where c.organizationId = :organizationId order by lower(c.name), c.id";
		return this.entityManager.createQuery(query, Object[].class)
			.setParameter("organizationId", organizationId)
			.getResultList()
			.stream()
			.map((row) -> new CategoryRow((Category) row[0], (Long) row[1]))
			.filter((row) -> staff || row.articles() > 0)
			.toList();
	}

}
