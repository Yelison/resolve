package com.resolve.api.common.security;

import java.util.UUID;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.jspecify.annotations.Nullable;

/**
 * Organización elegida en la sesión del servidor. Guarda solo un id que ya se comprobó contra las membresías de la
 * identidad; aun así, los resolvedores lo vuelven a validar en cada petición, porque la membresía puede haberse
 * retirado después.
 */
public final class SessionOrganization {

	static final String ATTRIBUTE = SessionOrganization.class.getName() + ".ORGANIZATION_ID";

	private SessionOrganization() {
	}

	/** El id guardado en la sesión actual, o {@code null} si no hay sesión o no se eligió ninguna organización. */
	public static @Nullable UUID read(HttpServletRequest request) {
		HttpSession session = request.getSession(false);
		return (session != null && session.getAttribute(ATTRIBUTE) instanceof UUID id) ? id : null;
	}

	public static void write(HttpServletRequest request, UUID organizationId) {
		request.getSession(true).setAttribute(ATTRIBUTE, organizationId);
	}

}
