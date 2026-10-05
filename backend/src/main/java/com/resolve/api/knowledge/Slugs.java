package com.resolve.api.knowledge;

import java.text.Normalizer;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Slugs ASCII de artículos y categorías: minúsculas, números y guiones. */
final class Slugs {

	/** Los títulos admiten 160 caracteres, pero el slug se recorta a 100 para dejar sitio al sufijo en la columna de 120. */
	static final int ARTICLE_MAX_LENGTH = 100;

	/** La columna de las categorías mide 80 y su slug no lleva sufijo. */
	static final int CATEGORY_MAX_LENGTH = 80;

	private static final String ARTICLE_FALLBACK = "articulo";

	private static final Pattern DIACRITICS = Pattern.compile("\\p{M}+");

	private static final Pattern NOT_ALPHANUMERIC = Pattern.compile("[^a-z0-9]+");

	private Slugs() {
	}

	/** Slug de un artículo a partir de su título. */
	static String from(String title) {
		return from(title, ARTICLE_MAX_LENGTH, ARTICLE_FALLBACK);
	}

	/**
	 * Descompone en NFD, quita las marcas diacríticas, pasa a minúsculas y sustituye cada tramo que no sea
	 * {@code [a-z0-9]} por un guion. Recorta a {@code maxLength} y quita los guiones de los extremos; si no queda
	 * nada (un título de solo símbolos, emojis o ideogramas) devuelve {@code fallback}.
	 */
	static String from(String text, int maxLength, String fallback) {
		String decomposed = Normalizer.normalize(text, Normalizer.Form.NFD);
		String ascii = DIACRITICS.matcher(decomposed).replaceAll("").toLowerCase(Locale.ROOT);
		String slug = NOT_ALPHANUMERIC.matcher(ascii).replaceAll("-");
		if (slug.length() > maxLength) {
			slug = slug.substring(0, maxLength);
		}
		slug = trimHyphens(slug);
		return slug.isEmpty() ? fallback : slug;
	}

	/** {@code base} si está libre; si no, el primer {@code base-2}, {@code base-3}… que no esté en {@code taken}. */
	static String firstFree(String base, Set<String> taken) {
		if (!taken.contains(base)) {
			return base;
		}
		int suffix = 2;
		while (taken.contains(base + "-" + suffix)) {
			suffix++;
		}
		return base + "-" + suffix;
	}

	private static String trimHyphens(String slug) {
		int start = 0;
		int end = slug.length();
		while (start < end && slug.charAt(start) == '-') {
			start++;
		}
		while (end > start && slug.charAt(end - 1) == '-') {
			end--;
		}
		return slug.substring(start, end);
	}

}
