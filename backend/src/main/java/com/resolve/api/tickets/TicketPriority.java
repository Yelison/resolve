package com.resolve.api.tickets;

import com.fasterxml.jackson.annotation.JsonValue;
import com.resolve.api.common.persistence.WireEnum;
import com.resolve.api.common.persistence.WireEnumConverter;
import jakarta.persistence.Converter;

public enum TicketPriority implements WireEnum {

	URGENT("urgent"),
	HIGH("high"),
	MEDIUM("medium"),
	LOW("low");

	private final String wireValue;

	TicketPriority(String wireValue) {
		this.wireValue = wireValue;
	}

	@Override
	@JsonValue
	public String wireValue() {
		return this.wireValue;
	}

	@Converter(autoApply = true)
	static class JpaConverter extends WireEnumConverter<TicketPriority> {

		JpaConverter() {
			super(TicketPriority.class);
		}

	}

}
