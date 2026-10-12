package com.resolve.api.common.security;

import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * El modo de alta de espacios de esta instalación, leído una vez al arrancar: un valor desconocido de
 * {@code resolve.organizations.creation} impide que la aplicación arranque ({@link OrganizationCreationMode#parse}). Lo
 * consultan la regla de seguridad de {@code POST /organizations}, el servicio que crea y la respuesta {@code 401} de quien
 * no tiene espacio, que son las tres que tienen que coincidir.
 */
@Component
public class OrganizationCreationPolicy {

	private final OrganizationCreationMode mode;

	public OrganizationCreationPolicy(@Value("${resolve.organizations.creation:admins}") @Nullable String mode) {
		this.mode = OrganizationCreationMode.parse(mode);
	}

	public OrganizationCreationMode mode() {
		return this.mode;
	}

	/** Si una identidad verificada sin ningún espacio puede crear el suyo. */
	public boolean isOpen() {
		return this.mode == OrganizationCreationMode.OPEN;
	}

}
