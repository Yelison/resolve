package com.resolve.api.memberships;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.resolve.api.common.error.ConflictException;
import com.resolve.api.common.persistence.Ids;
import com.resolve.api.common.persistence.LockTimeouts;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.memberships.MemberDtos.TeamMemberDto;
import com.resolve.api.organizations.OrganizationRepository;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Invitaciones de clientes al portal. Las solicita el módulo de clientes, que ya tiene bloqueado el registro del
 * cliente: eso serializa las invitaciones duplicadas y las deja ordenadas respecto a archivar y restaurar.
 */
@Component
public class PortalInvitations {

	private final MembershipRepository memberships;

	private final OrganizationRepository organizations;

	private final UserDirectory directory;

	private final Clock clock;

	private final JdbcClient jdbc;

	PortalInvitations(MembershipRepository memberships, OrganizationRepository organizations, UserDirectory directory,
			Clock clock, JdbcClient jdbc) {
		this.jdbc = jdbc;
		this.memberships = memberships;
		this.organizations = organizations;
		this.directory = directory;
		this.clock = clock;
	}

	/**
	 * Crea la membresía {@code customer} {@code invited} del cliente, o reutiliza la suya si estaba retirada.
	 * @throws ConflictException si el cliente ya tiene acceso, si su correo es de alguien del equipo o si su usuario
	 * ya está ligado a otro cliente
	 */
	@Transactional(propagation = Propagation.MANDATORY)
	public TeamMemberDto inviteCustomer(CurrentMember actor, UUID customerId, String customerName,
			String customerEmail) {
		UUID organizationId = actor.organizationId();
		List<Membership> linked = this.memberships.findByCustomer(organizationId, customerId);
		if (linked.stream().anyMatch((membership) -> membership.getStatus() != MemberStatus.REMOVED)) {
			throw new ConflictException("El cliente ya tiene acceso al portal.");
		}
		UserAccount user = this.directory.findOrCreate(customerName, customerEmail);
		Instant now = this.clock.instant();
		Membership membership = this.memberships.findByOrganizationAndUser(organizationId, user.getId()).orElse(null);
		if (membership == null) {
			membership = this.memberships.save(new Membership(Ids.newId(),
					this.organizations.getReferenceById(organizationId), user, Role.CUSTOMER, customerId, now));
		}
		else if (membership.getRole() != Role.CUSTOMER) {
			throw new ConflictException("Este correo ya pertenece al equipo.");
		}
		else if (!customerId.equals(membership.getCustomerId())) {
			throw new ConflictException("Este correo ya da acceso al portal a otro cliente.");
		}
		else {
			membership.reinvite(Role.CUSTOMER, now);
		}
		// El UPDATE de una membresía retirada espera la fila si otra transacción la retiene: se acota.
		LockTimeouts.limitWait(this.jdbc);
		this.memberships.flush();
		return TeamMemberDto.from(membership, 0);
	}

}
