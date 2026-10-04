package com.resolve.api.tickets;

import com.resolve.api.common.persistence.WireEnum;

/** Vistas de la bandeja. «mine» y «unassigned» excluyen los resueltos; «resolved» solo los incluye a ellos. */
public enum TicketView implements WireEnum {

	ALL("all"), MINE("mine"), UNASSIGNED("unassigned"), RESOLVED("resolved");

	private final String wireValue;

	TicketView(String wireValue) {
		this.wireValue = wireValue;
	}

	@Override
	public String wireValue() {
		return this.wireValue;
	}

}
