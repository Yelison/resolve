package com.resolve.api.tickets;

import com.fasterxml.jackson.annotation.JsonValue;
import com.resolve.api.common.persistence.WireEnum;
import com.resolve.api.common.persistence.WireEnumConverter;
import jakarta.persistence.Converter;

public enum TicketStatus implements WireEnum {

	OPEN("open"),
	IN_PROGRESS("in_progress"),
	WAITING("waiting"),
	RESOLVED("resolved");

	private final String wireValue;

	TicketStatus(String wireValue) {
		this.wireValue = wireValue;
	}

	@Override
	@JsonValue
	public String wireValue() {
		return this.wireValue;
	}

	@Converter(autoApply = true)
	static class JpaConverter extends WireEnumConverter<TicketStatus> {

		JpaConverter() {
			super(TicketStatus.class);
		}

	}

}
