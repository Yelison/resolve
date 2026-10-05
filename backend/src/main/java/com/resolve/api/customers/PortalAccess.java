package com.resolve.api.customers;

import java.util.Collection;

import com.fasterxml.jackson.annotation.JsonValue;
import com.resolve.api.common.persistence.WireEnum;
import com.resolve.api.memberships.MemberStatus;

/** Estado del acceso del cliente al portal: sin membresía vigente, invitado o activo. */
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

	/**
	 * Acceso que dan las membresías vigentes (no retiradas) de un cliente: {@code active} si alguna lo es, si no
	 * {@code invited}, y {@code none} sin ninguna. No tiene en cuenta el archivado del cliente.
	 */
	public static PortalAccess of(Collection<MemberStatus> liveStatuses) {
		if (liveStatuses.contains(MemberStatus.ACTIVE)) {
			return ACTIVE;
		}
		return liveStatuses.contains(MemberStatus.INVITED) ? INVITED : NONE;
	}

}
