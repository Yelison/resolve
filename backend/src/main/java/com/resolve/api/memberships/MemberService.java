package com.resolve.api.memberships;

import java.time.Clock;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Casos de uso de los miembros de la organización. */
@Service
class MemberService {

	private final MembershipRepository memberships;

	private final Clock clock;

	MemberService(MembershipRepository memberships, Clock clock) {
		this.memberships = memberships;
		this.clock = clock;
	}

	/**
	 * Activa una invitación en su propia transacción: el resolvedor del principal corre en una de solo lectura y la
	 * activación debe confirmarse aunque la petición que la provoca falle después.
	 * @return el estado en que queda la membresía; una retirada confirmada antes gana y devuelve
	 * {@link MemberStatus#REMOVED}
	 */
	@Transactional(propagation = Propagation.REQUIRES_NEW)
	MemberStatus activate(UUID membershipId) {
		if (this.memberships.activate(membershipId, this.clock.instant()) == 1) {
			return MemberStatus.ACTIVE;
		}
		return this.memberships.statusOf(membershipId).orElse(MemberStatus.REMOVED);
	}

}
