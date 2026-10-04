package com.resolve.api.customers;

import java.util.UUID;

import com.resolve.api.common.persistence.LikePatterns;
import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;
import com.resolve.api.common.web.SortDirection;
import jakarta.persistence.EntityManager;
import org.jspecify.annotations.Nullable;

/** Búsqueda de clientes: nombre, correo o empresa; orden por nombre sin distinguir mayúsculas y desempate por id. */
class CustomerSearchImpl implements CustomerSearch {

	private static final String FILTER = """
			from Customer c
			where c.organizationId = :organizationId
			  and (:pattern is null
			       or lower(c.name) like :pattern escape '\\'
			       or lower(c.email) like :pattern escape '\\'
			       or lower(coalesce(c.company, '')) like :pattern escape '\\')
			""";

	private final EntityManager entityManager;

	CustomerSearchImpl(EntityManager entityManager) {
		this.entityManager = entityManager;
	}

	@Override
	public PageResponse<Customer> search(UUID organizationId, @Nullable String text, PageQuery<CustomerSortField> page) {
		String pattern = (text == null || text.isBlank()) ? null : LikePatterns.contains(text.trim());
		String direction = (page.sort().direction() == SortDirection.DESC) ? "desc" : "asc";
		var items = this.entityManager
			.createQuery("select c " + FILTER + " order by lower(c.name) " + direction + ", c.id asc", Customer.class)
			.setParameter("organizationId", organizationId)
			.setParameter("pattern", pattern)
			.setFirstResult((int) page.offset())
			.setMaxResults(page.size())
			.getResultList();
		long total = this.entityManager.createQuery("select count(c) " + FILTER, Long.class)
			.setParameter("organizationId", organizationId)
			.setParameter("pattern", pattern)
			.getSingleResult();
		return PageResponse.of(items, page, total);
	}

}
