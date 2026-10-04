package com.resolve.api.memberships;

import com.fasterxml.jackson.annotation.JsonValue;
import com.resolve.api.common.persistence.WireEnum;
import com.resolve.api.common.persistence.WireEnumConverter;
import jakarta.persistence.Converter;

public enum Role implements WireEnum {

	ADMIN("admin"), AGENT("agent"), CUSTOMER("customer");

	private final String wireValue;

	Role(String wireValue) {
		this.wireValue = wireValue;
	}

	@Override
	@JsonValue
	public String wireValue() {
		return this.wireValue;
	}

	/** Administradores y agentes: gestionan tickets y ven notas internas. */
	public boolean isStaff() {
		return this != CUSTOMER;
	}

	@Converter(autoApply = true)
	static class JpaConverter extends WireEnumConverter<Role> {

		JpaConverter() {
			super(Role.class);
		}

	}

}
