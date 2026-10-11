package com.resolve.api.tickets;

import com.resolve.api.common.persistence.WireEnum;

/**
 * Qué tickets sin resolver se evalúan en «Necesitan atención»: los asignados a quien consulta o todos los de la
 * organización.
 */
enum AttentionScope implements WireEnum {

	MINE("mine"), TEAM("team");

	private final String wireValue;

	AttentionScope(String wireValue) {
		this.wireValue = wireValue;
	}

	@Override
	public String wireValue() {
		return this.wireValue;
	}

}
