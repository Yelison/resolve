package com.resolve.api.common.security;

import java.util.Locale;

import org.jspecify.annotations.Nullable;

/**
 * Quién puede crear espacios, según {@code resolve.organizations.creation} (docs/decisions/0004-workspaces.md, decisión
 * 1-D). {@link #ADMINS} es el valor por defecto y el único que existía antes de la fase 4a.
 */
public enum OrganizationCreationMode {

	/** Solo quien tiene una membresía {@code admin} activa en algún espacio. */
	ADMINS,

	/** Cualquier identidad verificada, también quien no tiene ningún espacio, mientras no llegue a su límite. */
	OPEN;

	static final String PROPERTY = "resolve.organizations.creation";

	/**
	 * El modo que nombra el valor, sin distinguir mayúsculas ni espacios. Vacío o ausente es {@link #ADMINS}: una variable
	 * de entorno definida pero vacía es «no definida», y el modo cerrado es el que no abre nada por accidente. Cualquier otro
	 * texto es un error de arranque, no un modo por defecto: un «opne» con el que el alta siguiera cerrada, o un «Open»
	 * ignorado, harían creer a quien despliega que la instalación está en otro estado del que está.
	 */
	public static OrganizationCreationMode parse(@Nullable String value) {
		String normalized = (value == null) ? "" : value.strip().toLowerCase(Locale.ROOT);
		return switch (normalized) {
			case "", "admins" -> ADMINS;
			case "open" -> OPEN;
			default -> throw new IllegalStateException(PROPERTY + " (RESOLVE_ORGANIZATIONS_CREATION) debe ser «admins» o «open»"
					+ " y es «" + value + "».");
		};
	}

}
