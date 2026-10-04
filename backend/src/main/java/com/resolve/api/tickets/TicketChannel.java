package com.resolve.api.tickets;

import com.fasterxml.jackson.annotation.JsonValue;
import com.resolve.api.common.persistence.WireEnum;
import com.resolve.api.common.persistence.WireEnumConverter;
import jakarta.persistence.Converter;

public enum TicketChannel implements WireEnum {

	EMAIL("email"),
	CHAT("chat"),
	PHONE("phone"),
	WEB("web");

	private final String wireValue;

	TicketChannel(String wireValue) {
		this.wireValue = wireValue;
	}

	@Override
	@JsonValue
	public String wireValue() {
		return this.wireValue;
	}

	@Converter(autoApply = true)
	static class JpaConverter extends WireEnumConverter<TicketChannel> {

		JpaConverter() {
			super(TicketChannel.class);
		}

	}

}
