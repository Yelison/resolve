package com.resolve.api.common.web;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.FieldErrorDetail;
import org.jspecify.annotations.Nullable;

/**
 * Página y orden de un listado. {@code page} empieza en 0, {@code size} vale 20 por defecto y como máximo 100,
 * y {@code sort} solo admite los campos que el recurso declara.
 */
public record PageQuery<F>(int page, int size, SortSpec<F> sort) {

	public static final int DEFAULT_SIZE = 20;

	public static final int MAX_SIZE = 100;

	public long offset() {
		return (long) this.page * this.size;
	}

	/**
	 * Valida los parámetros en crudo.
	 * @param sortableFields nombre en la API de cada campo ordenable
	 * @param defaultSort orden cuando la petición no indica ninguno
	 */
	public static <F> PageQuery<F> parse(@Nullable String page, @Nullable String size, @Nullable String sort,
			Map<String, F> sortableFields, SortSpec<F> defaultSort) {
		List<FieldErrorDetail> errors = new ArrayList<>();
		int pageNumber = parseInt(page, 0).filter((value) -> value >= 0).orElseGet(() -> {
			errors.add(new FieldErrorDetail("page", "Debe ser un número entero mayor o igual que 0."));
			return 0;
		});
		if ((long) pageNumber * MAX_SIZE > Integer.MAX_VALUE) {
			errors.add(new FieldErrorDetail("page", "La página es demasiado alta."));
			pageNumber = 0;
		}
		int pageSize = parseInt(size, DEFAULT_SIZE).filter((value) -> value >= 1 && value <= MAX_SIZE).orElseGet(() -> {
			errors.add(new FieldErrorDetail("size", "Debe ser un número entero entre 1 y " + MAX_SIZE + "."));
			return DEFAULT_SIZE;
		});
		SortSpec<F> sortSpec = parseSort(sort, sortableFields, defaultSort).orElseGet(() -> {
			errors.add(new FieldErrorDetail("sort",
					"Usa campo,dirección con uno de estos campos: " + String.join(", ", sortableFields.keySet()) + "."));
			return defaultSort;
		});
		if (!errors.isEmpty()) {
			throw new ApiValidationException(errors);
		}
		return new PageQuery<>(pageNumber, pageSize, sortSpec);
	}

	private static Optional<Integer> parseInt(@Nullable String value, int defaultValue) {
		if (value == null || value.isBlank()) {
			return Optional.of(defaultValue);
		}
		try {
			return Optional.of(Integer.parseInt(value.trim()));
		}
		catch (NumberFormatException exception) {
			return Optional.empty();
		}
	}

	private static <F> Optional<SortSpec<F>> parseSort(@Nullable String sort, Map<String, F> fields, SortSpec<F> defaultSort) {
		if (sort == null || sort.isBlank()) {
			return Optional.of(defaultSort);
		}
		String[] parts = sort.split(",", -1);
		if (parts.length != 2 || !fields.containsKey(parts[0])) {
			return Optional.empty();
		}
		return switch (parts[1]) {
			case "asc" -> Optional.of(new SortSpec<>(fields.get(parts[0]), SortDirection.ASC));
			case "desc" -> Optional.of(new SortSpec<>(fields.get(parts[0]), SortDirection.DESC));
			default -> Optional.empty();
		};
	}

}
