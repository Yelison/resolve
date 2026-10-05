package com.resolve.api.knowledge;

import java.util.Optional;
import java.util.UUID;

import com.resolve.api.common.web.PageQuery;
import com.resolve.api.common.web.PageResponse;

/** Lecturas de artículos que dependen de quién consulta; ver {@link ArticleScope}. */
public interface ArticleSearch {

	PageResponse<Article> search(UUID organizationId, boolean staff, ArticleFilters filters,
			PageQuery<ArticleSortField> page);

	/** Un artículo que el llamante puede leer, con su categoría y sus autores; los demás no aparecen. */
	Optional<Article> findReadable(UUID organizationId, boolean staff, String slug);

}
