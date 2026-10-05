package com.resolve.api.knowledge;

import org.jspecify.annotations.Nullable;

/** Filtros ya validados de la lista de artículos; {@code null} significa «sin filtro». */
record ArticleFilters(@Nullable String text, @Nullable String categorySlug, @Nullable ArticleStatus status) {
}
