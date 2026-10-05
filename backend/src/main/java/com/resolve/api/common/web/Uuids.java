package com.resolve.api.common.web;

import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lectura de los {@code format: uuid} del contrato. {@link UUID#fromString(String)} acepta formas que no son
 * canónicas ({@code 1-2-3-4-5}), así que todo parámetro y cuerpo pasa por aquí: 36 caracteres, con guiones, en
 * minúscula o mayúscula. No se exige versión ni variante.
 */
public final class Uuids {

	/** La forma canónica, con solo espacio, tabulador y saltos de línea alrededor; nada más se ignora. */
	private static final Pattern CANONICAL = Pattern.compile("[ \\t\\r\\n]*"
			+ "([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})" + "[ \\t\\r\\n]*");

	private Uuids() {
	}

	/** El UUID del texto sin espacio, tabulador ni saltos de línea alrededor, o vacío si no es canónico. */
	public static Optional<UUID> parse(String value) {
		Matcher matcher = CANONICAL.matcher(value);
		if (!matcher.matches()) {
			return Optional.empty();
		}
		return Optional.of(UUID.fromString(matcher.group(1)));
	}

}
