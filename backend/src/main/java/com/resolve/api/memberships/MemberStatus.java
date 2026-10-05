package com.resolve.api.memberships;

import com.fasterxml.jackson.annotation.JsonValue;
import com.resolve.api.common.persistence.WireEnum;
import com.resolve.api.common.persistence.WireEnumConverter;
import jakarta.persistence.Converter;

/**
 * Estado de una membresía. {@code invited}: ligada a un correo que aún no ha entrado; {@code active}: puede usar la
 * API; {@code removed}: ya no entra, pero su fila se conserva por el historial que la referencia.
 */
public enum MemberStatus implements WireEnum {

	INVITED("invited"), ACTIVE("active"), REMOVED("removed");

	private final String wireValue;

	MemberStatus(String wireValue) {
		this.wireValue = wireValue;
	}

	@Override
	@JsonValue
	public String wireValue() {
		return this.wireValue;
	}

	@Converter(autoApply = true)
	static class JpaConverter extends WireEnumConverter<MemberStatus> {

		JpaConverter() {
			super(MemberStatus.class);
		}

	}

}
