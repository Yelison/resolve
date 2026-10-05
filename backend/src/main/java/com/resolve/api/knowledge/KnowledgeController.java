package com.resolve.api.knowledge;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.FieldErrorDetail;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;
import com.resolve.api.common.web.SortDirection;
import com.resolve.api.common.web.SortSpec;
import com.resolve.api.knowledge.KnowledgeDtos.ArticleDto;
import com.resolve.api.knowledge.KnowledgeDtos.ArticleSummaryDto;
import com.resolve.api.knowledge.KnowledgeDtos.CategoryDto;
import org.jspecify.annotations.Nullable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import tools.jackson.databind.JsonNode;

@RestController
class KnowledgeController {

	static final String MERGE_PATCH_JSON = "application/merge-patch+json";

	private static final Map<String, ArticleSortField> SORTABLE = Map.of("updatedAt", ArticleSortField.UPDATED_AT,
			"title", ArticleSortField.TITLE);

	private static final SortSpec<ArticleSortField> DEFAULT_SORT = new SortSpec<>(ArticleSortField.UPDATED_AT,
			SortDirection.DESC);

	private final ArticleService articles;

	private final CategoryService categories;

	KnowledgeController(ArticleService articles, CategoryService categories) {
		this.articles = articles;
		this.categories = categories;
	}

	@GetMapping("/knowledge/categories")
	List<CategoryDto> listCategories(@AuthenticationPrincipal CurrentMember member) {
		return this.categories.list(member);
	}

	@PostMapping("/knowledge/categories")
	ResponseEntity<CategoryDto> createCategory(@AuthenticationPrincipal CurrentMember member,
			@RequestBody(required = false) @Nullable JsonNode body) {
		return ResponseEntity.status(201).body(this.categories.create(member, ArticleRequestParser.newCategory(body)));
	}

	@GetMapping("/knowledge/articles")
	PageResponse<ArticleSummaryDto> listArticles(@AuthenticationPrincipal CurrentMember member,
			@RequestParam(required = false) @Nullable String q,
			@RequestParam(required = false) @Nullable String category,
			@RequestParam(required = false) @Nullable String status,
			@RequestParam(required = false) @Nullable String page, @RequestParam(required = false) @Nullable String size,
			@RequestParam(required = false) @Nullable String sort) {
		List<FieldErrorDetail> errors = new ArrayList<>();
		PageQuery<ArticleSortField> pageQuery = collect(errors,
				() -> PageQuery.parse(page, size, sort, SORTABLE, DEFAULT_SORT));
		ArticleFilters filters = collect(errors, () -> ArticleRequestParser.filters(q, category, status));
		if (!errors.isEmpty()) {
			throw new ApiValidationException(errors);
		}
		return this.articles.list(member, filters, pageQuery);
	}

	/** Ejecuta un análisis y acumula sus errores para responder todos juntos. */
	private static <T> @Nullable T collect(List<FieldErrorDetail> errors, Supplier<T> parser) {
		try {
			return parser.get();
		}
		catch (ApiValidationException exception) {
			errors.addAll(exception.errors());
			return null;
		}
	}

	@PostMapping("/knowledge/articles")
	ResponseEntity<ArticleDto> createArticle(@AuthenticationPrincipal CurrentMember member,
			@RequestBody(required = false) @Nullable JsonNode body) {
		ArticleDto article = this.articles.create(member, ArticleRequestParser.newArticle(body));
		URI location = ServletUriComponentsBuilder.fromCurrentRequestUri()
			.path("/{slug}")
			.buildAndExpand(article.slug())
			.toUri();
		return ResponseEntity.created(location).eTag(etag(article)).body(article);
	}

	@GetMapping("/knowledge/articles/{slug}")
	ResponseEntity<ArticleDto> getArticle(@AuthenticationPrincipal CurrentMember member, @PathVariable String slug) {
		return ok(this.articles.get(member, slug));
	}

	/** El cuerpo se valida dentro del servicio, después de buscar el artículo y comprobar If-Match. */
	@PatchMapping(path = "/knowledge/articles/{slug}", consumes = { MERGE_PATCH_JSON, "application/json" })
	ResponseEntity<ArticleDto> updateArticle(@AuthenticationPrincipal CurrentMember member, @PathVariable String slug,
			@RequestHeader(name = "If-Match", required = false) @Nullable String ifMatch,
			@RequestBody(required = false) @Nullable JsonNode body) {
		return ok(this.articles.update(member, slug, ifMatch, () -> ArticleRequestParser.changes(body)));
	}

	@PostMapping("/knowledge/articles/{slug}/publish")
	ResponseEntity<ArticleDto> publishArticle(@AuthenticationPrincipal CurrentMember member,
			@PathVariable String slug) {
		return ok(this.articles.publish(member, slug));
	}

	@PostMapping("/knowledge/articles/{slug}/unpublish")
	ResponseEntity<ArticleDto> unpublishArticle(@AuthenticationPrincipal CurrentMember member,
			@PathVariable String slug) {
		return ok(this.articles.unpublish(member, slug));
	}

	private static ResponseEntity<ArticleDto> ok(ArticleDto article) {
		return ResponseEntity.ok().eTag(etag(article)).body(article);
	}

	private static String etag(ArticleDto article) {
		return String.valueOf(article.version());
	}

}
