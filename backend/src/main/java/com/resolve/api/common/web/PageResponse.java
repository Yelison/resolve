package com.resolve.api.common.web;

import java.util.List;
import java.util.function.Function;

/** Sobre de los listados paginados: {@code { items, page, size, totalItems, totalPages }}. */
public record PageResponse<T>(List<T> items, int page, int size, long totalItems, int totalPages) {

	public static <T> PageResponse<T> of(List<T> items, PageQuery<?> query, long totalItems) {
		int totalPages = (int) ((totalItems + query.size() - 1) / query.size());
		return new PageResponse<>(List.copyOf(items), query.page(), query.size(), totalItems, totalPages);
	}

	public <R> PageResponse<R> map(Function<T, R> mapper) {
		return new PageResponse<>(this.items.stream().map(mapper).toList(), this.page, this.size, this.totalItems,
				this.totalPages);
	}

}
