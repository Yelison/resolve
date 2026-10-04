package com.resolve.api.tickets;

/** Campos ordenables de la bandeja con su expresión JPQL; prioridad y estado se ordenan por rango. */
enum TicketSortField {

	UPDATED_AT("t.updatedAt"), CREATED_AT("t.createdAt"), NUMBER("t.number"),
	PRIORITY("""
			case t.priority when com.resolve.api.tickets.TicketPriority.LOW then 1
				when com.resolve.api.tickets.TicketPriority.MEDIUM then 2
				when com.resolve.api.tickets.TicketPriority.HIGH then 3 else 4 end"""),
	STATUS("""
			case t.status when com.resolve.api.tickets.TicketStatus.OPEN then 1
				when com.resolve.api.tickets.TicketStatus.IN_PROGRESS then 2
				when com.resolve.api.tickets.TicketStatus.WAITING then 3 else 4 end""");

	private final String expression;

	TicketSortField(String expression) {
		this.expression = expression;
	}

	String expression() {
		return this.expression;
	}

}
