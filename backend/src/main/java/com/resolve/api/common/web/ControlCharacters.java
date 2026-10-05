package com.resolve.api.common.web;

/**
 * Caracteres de control en texto de usuario. PostgreSQL rechaza el byte 0 (SQLSTATE 22021) y el resto de controles
 * no tienen sentido en un nombre, un asunto o un filtro. Se comprueba sobre el valor tal como llega, antes de
 * recortarlo: {@link String#trim()} elimina los NUL de los extremos y los escondería.
 */
public final class ControlCharacters {

	public static final String MESSAGE = "No admite caracteres de control.";

	private ControlCharacters() {
	}

	/** Un único carácter de control cualquiera; con {@code allowLayout} se admiten saltos de línea y tabuladores. */
	public static boolean in(String text, boolean allowLayout) {
		return text.chars()
			.anyMatch((character) -> Character.isISOControl(character)
					&& !(allowLayout && (character == '\n' || character == '\r' || character == '\t')));
	}

}
