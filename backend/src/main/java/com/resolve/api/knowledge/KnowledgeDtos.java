package com.resolve.api.knowledge;

import java.time.Instant;
import java.util.UUID;

import com.resolve.api.memberships.MemberRefDto;
import org.jspecify.annotations.Nullable;

/** Representaciones de la API de la base de conocimiento. */
public final class KnowledgeDtos {

	private KnowledgeDtos() {
	}

	/** Categoría con el número de artículos que puede leer quien consulta. */
	public record CategoryDto(UUID id, String name, String slug, @Nullable String description, long articles) {

		static CategoryDto from(Category category, long articles) {
			return new CategoryDto(category.getId(), category.getName(), category.getSlug(), category.getDescription(),
					articles);
		}

	}

	/** Categoría tal como se muestra dentro de un artículo. */
	public record CategoryRefDto(UUID id, String name, String slug) {

		static CategoryRefDto from(Category category) {
			return new CategoryRefDto(category.getId(), category.getName(), category.getSlug());
		}

	}

	/** Fila de las listas: sin cuerpo. */
	public record ArticleSummaryDto(UUID id, String slug, String title, CategoryRefDto category, ArticleStatus status,
			ArticleVisibility visibility, Instant updatedAt, @Nullable Instant publishedAt) {

		static ArticleSummaryDto from(Article article) {
			return new ArticleSummaryDto(article.getId(), article.getSlug(), article.getTitle(),
					CategoryRefDto.from(article.getCategory()), article.getStatus(), article.getVisibility(),
					article.getUpdatedAt(), article.getPublishedAt());
		}

	}

	/** Detalle: los campos de {@link ArticleSummaryDto} más cuerpo, valoraciones permitidas, versión y autores. */
	public record ArticleDto(UUID id, String slug, String title, CategoryRefDto category, ArticleStatus status,
			ArticleVisibility visibility, Instant updatedAt, @Nullable Instant publishedAt, String body,
			boolean allowFeedback, long version, MemberRefDto createdBy, MemberRefDto updatedBy) {

		static ArticleDto from(Article article) {
			return new ArticleDto(article.getId(), article.getSlug(), article.getTitle(),
					CategoryRefDto.from(article.getCategory()), article.getStatus(), article.getVisibility(),
					article.getUpdatedAt(), article.getPublishedAt(), article.getBody(), article.isAllowFeedback(),
					article.getVersion(), MemberRefDto.from(article.getCreatedBy()),
					MemberRefDto.from(article.getUpdatedBy()));
		}

	}

}
