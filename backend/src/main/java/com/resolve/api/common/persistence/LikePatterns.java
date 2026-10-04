package com.resolve.api.common.persistence;

import java.util.Locale;

/** Patrones LIKE seguros: el texto del usuario nunca actúa como comodín. */
public final class LikePatterns {

	public static final char ESCAPE = '\\';

	private LikePatterns() {
	}

	/** Patrón «contiene» en minúsculas, con {@code %}, {@code _} y la barra escapados. */
	public static String contains(String text) {
		String lower = text.toLowerCase(Locale.ROOT);
		StringBuilder pattern = new StringBuilder(lower.length() + 2).append('%');
		for (char character : lower.toCharArray()) {
			if (character == '%' || character == '_' || character == ESCAPE) {
				pattern.append(ESCAPE);
			}
			pattern.append(character);
		}
		return pattern.append('%').toString();
	}

}
