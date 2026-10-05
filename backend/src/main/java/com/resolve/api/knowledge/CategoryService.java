package com.resolve.api.knowledge;

import java.time.Clock;
import java.util.List;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.persistence.Ids;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.knowledge.ArticleRequestParser.NewCategory;
import com.resolve.api.knowledge.KnowledgeDtos.CategoryDto;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Casos de uso de categorías. Solo los administradores las crean; la capa de seguridad ya lo exige. */
@Service
class CategoryService {

	private static final String SLUG_CONSTRAINT = "knowledge_categories_organization_slug_key";

	private static final String DUPLICATE_NAME = "Ya existe una categoría con un nombre equivalente.";

	private final CategoryRepository categories;

	private final Clock clock;

	CategoryService(CategoryRepository categories, Clock clock) {
		this.categories = categories;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	List<CategoryDto> list(CurrentMember member) {
		return this.categories.listWithCounts(member.organizationId(), member.isStaff())
			.stream()
			.map((row) -> CategoryDto.from(row.category(), row.articles()))
			.toList();
	}

	/**
	 * Crea una categoría. Su slug sale del nombre y no lleva sufijo: un nombre cuyo slug ya existe es un error del
	 * campo {@code name}, también cuando dos altas simultáneas compiten y decide la restricción única.
	 */
	@Transactional
	CategoryDto create(CurrentMember member, NewCategory request) {
		String slug = Slugs.from(request.name(), Slugs.CATEGORY_MAX_LENGTH, "categoria");
		if (this.categories.existsByOrganizationIdAndSlug(member.organizationId(), slug)) {
			throw new ApiValidationException("name", DUPLICATE_NAME);
		}
		Category category = new Category(Ids.newId(), member.organizationId(), request.name(), slug,
				request.description(), this.clock.instant());
		this.categories.save(category);
		flushUniqueSlug();
		return CategoryDto.from(category, 0);
	}

	/** Traduce a error de {@code name} solo la violación del índice único del slug; cualquier otra se relanza. */
	private void flushUniqueSlug() {
		try {
			this.categories.flush();
		}
		catch (DataIntegrityViolationException exception) {
			if (!violatesUniqueSlug(exception)) {
				throw exception;
			}
			throw new ApiValidationException("name", DUPLICATE_NAME);
		}
	}

	private static boolean violatesUniqueSlug(Throwable exception) {
		for (Throwable cause = exception; cause != null; cause = cause.getCause()) {
			if (cause instanceof ConstraintViolationException violation
					&& SLUG_CONSTRAINT.equalsIgnoreCase(violation.getConstraintName())) {
				return true;
			}
		}
		return false;
	}

}
