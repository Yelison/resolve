package com.resolve.api.tickets;

import com.fasterxml.jackson.annotation.JsonValue;
import com.resolve.api.common.persistence.WireEnum;
import com.resolve.api.common.persistence.WireEnumConverter;
import jakarta.persistence.Converter;

public enum MessageVisibility implements WireEnum {

	PUBLIC("public"),
	INTERNAL("internal");

	private final String wireValue;

	MessageVisibility(String wireValue) {
		this.wireValue = wireValue;
	}

	@Override
	@JsonValue
	public String wireValue() {
		return this.wireValue;
	}

	@Converter(autoApply = true)
	static class JpaConverter extends WireEnumConverter<MessageVisibility> {

		JpaConverter() {
			super(MessageVisibility.class);
		}

	}

}
