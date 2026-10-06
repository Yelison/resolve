package com.resolve.api.common.error;

/**
 * Valor del miembro {@code type} de los Problem Details que un cliente tiene que distinguir sin leer el texto de su
 * {@code detail}, que está en español y puede cambiar. Son identificadores, no direcciones que haya que resolver
 * (RFC 9457 §3.1.1); se declaran también en docs/api/openapi.yaml. Cualquier otro problema sigue siendo
 * {@code about:blank}.
 */
public final class ProblemTypes {

	private static final String BASE = "https://resolve.example/problems/";

	/** 403: la petición no trae un token CSRF válido. */
	public static final String CSRF = BASE + "csrf";

	/** 401: la identidad existe pero su membresía se retiró o su cliente se archivó. */
	public static final String ACCESS_DEACTIVATED = BASE + "access-deactivated";

	/** 401: el proveedor de identidad autenticó a la persona, pero no tiene ninguna membresía. */
	public static final String NO_MEMBERSHIP = BASE + "no-membership";

	/** 409: la organización que la pantalla dice mostrar no es la de la sesión. */
	public static final String ORGANIZATION_MISMATCH = BASE + "organization-mismatch";

	private ProblemTypes() {
	}

}
