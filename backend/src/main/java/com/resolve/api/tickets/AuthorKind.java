package com.resolve.api.tickets;

import com.fasterxml.jackson.annotation.JsonValue;
import com.resolve.api.common.persistence.WireEnum;
import com.resolve.api.common.persistence.WireEnumConverter;
import jakarta.persistence.Converter;

public enum AuthorKind implements WireEnum {

	AGENT("agent"),
	CUSTOMER("customer");

	private final String wireValue;

	AuthorKind(String wireValue) {
		this.wireValue = wireValue;
	}

	@Override
	@JsonValue
	public String wireValue() {
		return this.wireValue;
	}

	@Converter(autoApply = true)
	static class JpaConverter extends WireEnumConverter<AuthorKind> {

		JpaConverter() {
			super(AuthorKind.class);
		}

	}

}
