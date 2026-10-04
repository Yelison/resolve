package com.resolve.api.tickets;

import com.fasterxml.jackson.annotation.JsonValue;
import com.resolve.api.common.persistence.WireEnum;
import com.resolve.api.common.persistence.WireEnumConverter;
import jakarta.persistence.Converter;

public enum ActivityType implements WireEnum {

	CREATED("created"),
	STATUS_CHANGED("status_changed"),
	PRIORITY_CHANGED("priority_changed"),
	ASSIGNEE_CHANGED("assignee_changed");

	private final String wireValue;

	ActivityType(String wireValue) {
		this.wireValue = wireValue;
	}

	@Override
	@JsonValue
	public String wireValue() {
		return this.wireValue;
	}

	@Converter(autoApply = true)
	static class JpaConverter extends WireEnumConverter<ActivityType> {

		JpaConverter() {
			super(ActivityType.class);
		}

	}

}
