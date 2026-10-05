package com.resolve.api.common.web;

import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Lectura de los {@code format: uuid} del contrato. {@link UUID#fromString(String)} acepta formas que no son
 * canónicas ({@code 1-2-3-4-5}), así que todo parámetro y cuerpo pasa por aquí: 36 caracteres, con guiones, en
 * minúscula o mayúscula. No se exige versión ni variante.
 */
public final class Uuids {

	private static final Pattern CANONICAL = Pattern
		.compile("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");

	private Uuids() {
	}

	/** El UUID del texto recortado, o vacío si no tiene la forma canónica. */
	public static Optional<UUID> parse(String value) {
		String trimmed = value.trim();
		if (!CANONICAL.matcher(trimmed).matches()) {
			return Optional.empty();
		}
		return Optional.of(UUID.fromString(trimmed));
	}

}
