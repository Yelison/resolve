package com.resolve.api.tickets;

import com.fasterxml.jackson.annotation.JsonValue;
import com.resolve.api.common.persistence.WireEnum;

/**
 * Por qué un ticket necesita atención. El orden de declaración es el de la lista, de más a menos urgente, y también el
 * de prioridad entre reglas: un ticket tiene a lo sumo un motivo, el primero que cumple.
 */
enum AttentionReason implements WireEnum {

	URGENT("urgent"), UNANSWERED("unanswered"), UNASSIGNED("unassigned"), CUSTOMER_REPLIED("customer_replied"),
	HIGH("high"), WAITING("waiting");

	private final String wireValue;

	AttentionReason(String wireValue) {
		this.wireValue = wireValue;
	}

	@Override
	@JsonValue
	public String wireValue() {
		return this.wireValue;
	}

}
