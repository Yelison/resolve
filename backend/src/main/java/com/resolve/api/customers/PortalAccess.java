package com.resolve.api.customers;

import com.fasterxml.jackson.annotation.JsonValue;
import com.resolve.api.common.persistence.WireEnum;

/** Estado del acceso del cliente al portal: sin membresía, invitado o activo. */
public enum PortalAccess implements WireEnum {

	NONE("none"), INVITED("invited"), ACTIVE("active");

	private final String wireValue;

	PortalAccess(String wireValue) {
		this.wireValue = wireValue;
	}

	@Override
	@JsonValue
	public String wireValue() {
		return this.wireValue;
	}

}
