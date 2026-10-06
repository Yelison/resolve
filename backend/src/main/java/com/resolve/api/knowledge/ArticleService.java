package com.resolve.api.knowledge;

import java.time.Clock;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.ConflictException;
import com.resolve.api.common.error.PreconditionFailedException;
import com.resolve.api.common.error.ResourceNotFoundException;
import com.resolve.api.common.persistence.Ids;
import com.resolve.api.common.persistence.LockTimeouts;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.common.web.DemoLimits;
import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;
import com.resolve.api.common.web.Preconditions;
import com.resolve.api.knowledge.ArticleRequestParser.ArticleChanges;
import com.resolve.api.knowledge.ArticleRequestParser.NewArticle;
import com.resolve.api.knowledge.KnowledgeDtos.ArticleDto;
import com.resolve.api.knowledge.KnowledgeDtos.ArticleSummaryDto;
import com.resolve.api.memberships.UserAccount;
import com.resolve.api.memberships.UserAccountRepository;
import org.hibernate.exception.ConstraintViolationException;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Casos de uso de artículos. Toda lectura y escritura parte del {@link CurrentMember}: la organización siempre sale
 * del principal y un artículo ajeno, o que un cliente no puede leer, responde igual que uno inexistente (404).
 */
@Service
class ArticleService {

	private static final String SLUG_CONSTRAINT = "articles_organization_slug_key";

	static final String UNKNOWN_CATEGORY = "No existe la categoría.";

	private final ArticleRepository articles;

	private final CategoryRepository categories;

	private final UserAccountRepository users;

	private final JdbcClient jdbc;

	private final Clock clock;

	private final ObjectProvider<ArticleSlugHook> slugHook;

	private final DemoLimits demoLimits;

	ArticleService(ArticleRepository articles, CategoryRepository categories, UserAccountRepository users,
			JdbcClient jdbc, Clock clock, ObjectProvider<ArticleSlugHook> slugHook, DemoLimits demoLimits) {
		this.articles = articles;
		this.categories = categories;
		this.users = users;
		this.jdbc = jdbc;
		this.clock = clock;
		this.slugHook = slugHook;
		this.demoLimits = demoLimits;
	}

	@Transactional(readOnly = true)
	PageResponse<ArticleSummaryDto> list(CurrentMember member, ArticleFilters filters,
			PageQuery<ArticleSortField> page) {
		return this.articles.search(member.organizationId(), member.isStaff(), filters, page)
			.map(ArticleSummaryDto::from);
	}

	@Transactional(readOnly = true)
	ArticleDto get(CurrentMember member, String slug) {
		return ArticleDto.from(this.articles.findReadable(member.organizationId(), member.isStaff(), slug)
			.orElseThrow(ArticleService::notFound));
	}

	/**
	 * Crea un borrador. El slug sale del título: {@code base}, y si ya existe el primer sufijo libre. Para que dos
	 * altas simultáneas no elijan el mismo, cada una toma un bloqueo de transacción de la organización antes de leer
	 * los slugs ocupados y lo conserva hasta el commit; la restricción única queda como red de seguridad.
	 */
	@Transactional
	ArticleDto create(CurrentMember member, NewArticle request) {
		UUID organizationId = member.organizationId();
		Category category = category(organizationId, request.categoryId());
		UserAccount author = author(member);
		lockSlugs(organizationId);
		this.demoLimits.check(DemoLimits.Resource.ARTICLES, organizationId);
		String slug = freeSlug(organizationId, Slugs.from(request.title()));
		this.slugHook.ifAvailable(ArticleSlugHook::afterSlugChosen);
		Article article = new Article(Ids.newId(), organizationId, category, slug, request.title(), request.body(),
				request.visibility(), request.allowFeedback(), author, this.clock.instant());
		flushUniqueSlug(article);
		return ArticleDto.from(article);
	}

	/**
	 * Aplica un merge-patch. Orden de errores del contrato: 404, 428, 400 y 412 (401 y 403 ya los resolvió la capa de
	 * seguridad). Un patch sin cambios responde 200 sin nueva versión ni nuevo editor.
	 */
	@Transactional
	ArticleDto update(CurrentMember member, String slug, @Nullable String ifMatch, Supplier<ArticleChanges> body) {
		Article article = findForUpdate(member, slug);
		long expectedVersion = Preconditions.requireVersion(ifMatch, "artículo");
		ArticleChanges changes = body.get();
		Category category = (changes.categoryId() != null) ? category(member.organizationId(), changes.categoryId())
				: article.getCategory();
		if (article.getVersion() != expectedVersion) {
			throw new PreconditionFailedException(
					"El artículo cambió desde que lo abriste. Vuelve a cargarlo para ver los cambios.");
		}
		article.edit((changes.title() != null) ? changes.title() : article.getTitle(),
				(changes.body() != null) ? changes.body() : article.getBody(), category,
				(changes.visibility() != null) ? changes.visibility() : article.getVisibility(),
				(changes.allowFeedback() != null) ? changes.allowFeedback() : article.isAllowFeedback(),
				author(member), this.clock.instant());
		// El flush dentro de la transacción hace visible la nueva versión en la respuesta.
		this.articles.flush();
		return ArticleDto.from(article);
	}

	@Transactional
	ArticleDto publish(CurrentMember member, String slug) {
		Article article = findForUpdate(member, slug);
		if (!article.publish(author(member), this.clock.instant())) {
			throw new ConflictException("El artículo ya está publicado.");
		}
		this.articles.flush();
		return ArticleDto.from(article);
	}

	@Transactional
	ArticleDto unpublish(CurrentMember member, String slug) {
		Article article = findForUpdate(member, slug);
		if (!article.unpublish(author(member), this.clock.instant())) {
			throw new ConflictException("El artículo ya es un borrador.");
		}
		this.articles.flush();
		return ArticleDto.from(article);
	}

	/** Una categoría de la organización; una ajena responde igual que una inexistente (400 en {@code categoryId}). */
	private Category category(UUID organizationId, UUID categoryId) {
		return this.categories.findByOrganizationIdAndId(organizationId, categoryId)
			.orElseThrow(() -> new ApiValidationException("categoryId", UNKNOWN_CATEGORY));
	}

	private UserAccount author(CurrentMember member) {
		return this.users.findById(member.userId()).orElseThrow();
	}

	/** Carga el artículo con la fila bloqueada hasta el commit; uno ajeno o inexistente responde 404. */
	private Article findForUpdate(CurrentMember member, String slug) {
		return this.articles.lockBySlug(member.organizationId(), slug).orElseThrow(ArticleService::notFound);
	}

	/**
	 * Exclusión mutua de las altas de una organización hasta el commit ({@code pg_advisory_xact_lock}). Un bloqueo por
	 * organización y no por slug: «Factura» y «Factura 2» compiten por {@code factura-2} con bases distintas.
	 */
	private void lockSlugs(UUID organizationId) {
		LockTimeouts.lockAdvisory(this.jdbc, "article-slug:" + organizationId);
	}

	private String freeSlug(UUID organizationId, String base) {
		// Los slugs solo contienen [a-z0-9-], así que el guion y el comodín no necesitan escape.
		Set<String> taken = new HashSet<>(this.articles.slugsStartingWith(organizationId, base, base + "-%"));
		taken.addAll(Slugs.RESERVED);
		return Slugs.firstFree(base, taken);
	}

	/**
	 * Guarda el artículo y traduce a 409 solo la violación del índice único del slug, que el bloqueo de las altas hace
	 * inalcanzable por esta API pero que otra vía de escritura podría provocar; cualquier otro error se relanza.
	 */
	private void flushUniqueSlug(Article article) {
		try {
			this.articles.saveAndFlush(article);
		}
		catch (DataIntegrityViolationException exception) {
			if (!violatesUniqueSlug(exception)) {
				throw exception;
			}
			throw new ConflictException("Otro artículo acaba de tomar ese título; vuelve a intentarlo.");
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

	private static ResourceNotFoundException notFound() {
		return new ResourceNotFoundException("No existe el artículo.");
	}

}
