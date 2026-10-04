package com.resolve.api.tickets;

import java.util.UUID;

import com.resolve.api.common.security.CurrentMember;
import org.jspecify.annotations.Nullable;

/** Alcance de lectura: la organización del principal y, para clientes, su registro de cliente. */
record TicketScope(UUID organizationId, UUID userId, @Nullable UUID customerId) {

	static TicketScope of(CurrentMember member) {
		return new TicketScope(member.organizationId(), member.userId(), member.isStaff() ? null : member.customerId());
	}

}
