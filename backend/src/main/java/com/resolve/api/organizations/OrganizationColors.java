package com.resolve.api.organizations;

import java.util.List;
import java.util.UUID;

/**
 * Las ocho claves de color con que se distinguen los espacios (no valores hexadecimales: cada clave tiene su tono claro
 * y oscuro en la interfaz) y el color que le toca a un id. El orden es parte del contrato: la función
 * {@code organization_color} de la migración V10 usa la misma lista y la misma regla, para que el color de un id sea
 * siempre el mismo se calcule donde se calcule.
 */
public final class OrganizationColors {

	public static final List<String> KEYS = List.of("blue", "green", "magenta", "orange", "violet", "teal", "brick",
			"slate");

	private OrganizationColors() {
	}

	/**
	 * La clave número «tres bits bajos del id». Es el último byte módulo 8 de la migración. Los ids son UUIDv7: los bits
	 * altos son la marca de tiempo y agruparían los colores; los bajos son aleatorios.
	 */
	public static String forId(UUID id) {
		return KEYS.get((int) (id.getLeastSignificantBits() & 7));
	}

	public static boolean isKey(String value) {
		return KEYS.contains(value);
	}

}
