package com.resolve.api.memberships;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.ConflictException;
import com.resolve.api.common.error.ResourceNotFoundException;
import com.resolve.api.common.persistence.Ids;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.customers.CustomerRepository;
import com.resolve.api.memberships.MemberDtos.TeamMemberDto;
import com.resolve.api.memberships.MemberDtos.TeamMetricsDto;
import com.resolve.api.memberships.MemberRequestParser.NewInvite;
import com.resolve.api.organizations.OrganizationRepository;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Casos de uso de los miembros. La organización siempre sale del {@link CurrentMember}; un usuario ajeno, inexistente
 * o que no sea administrador ni agente responde igual (404). Las escrituras del equipo se serializan por
 * organización para que la regla del último administrador se evalúe sobre el estado ya confirmado.
 */
@Service
class MemberService {

	private static final String UNKNOWN_MEMBER = "No existe el miembro.";

	private static final String CUSTOMER_EMAIL = "Este correo pertenece a un cliente.";

	private static final String ALREADY_MEMBER = "Ya forma parte del equipo.";

	private static final String LAST_ADMIN = "La organización debe conservar al menos un administrador activo.";

	private final MembershipRepository memberships;

	private final CustomerRepository customers;

	private final OrganizationRepository organizations;

	private final UserDirectory directory;

	private final TeamMetricsQuery metrics;

	private final AssignedTicketReleaser tickets;

	private final JdbcClient jdbc;

	private final Clock clock;

	private final ObjectProvider<MemberGuardHook> guardHook;

	MemberService(MembershipRepository memberships, CustomerRepository customers, OrganizationRepository organizations,
			UserDirectory directory, TeamMetricsQuery metrics, AssignedTicketReleaser tickets, JdbcClient jdbc,
			Clock clock, ObjectProvider<MemberGuardHook> guardHook) {
		this.memberships = memberships;
		this.customers = customers;
		this.organizations = organizations;
		this.directory = directory;
		this.metrics = metrics;
		this.tickets = tickets;
		this.jdbc = jdbc;
		this.clock = clock;
		this.guardHook = guardHook;
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

	/**
	 * Toma el nombre del proveedor de identidad solo cuando el guardado es un marcador de posición (vacío o la parte
	 * local del correo, como deja una invitación): nunca pisa un nombre que la persona eligió. El {@code UPDATE} repite
	 * la condición, así que un cambio de nombre concurrente gana.
	 * @return el nombre que queda guardado
	 */
	String adoptIdentityName(UserAccount user, @Nullable String identityName) {
		String candidate = cleanIdentityName(identityName);
		String current = user.getName();
		String localPart = user.getEmail().substring(0, Math.max(0, user.getEmail().indexOf('@')));
		if (candidate == null || candidate.equals(current) || !(current.isBlank() || current.equalsIgnoreCase(localPart))) {
			return current;
		}
		int updated = this.jdbc
			.sql("UPDATE users SET name = ? WHERE id = ? AND (name = '' OR lower(name) = lower(?))")
			.params(candidate, user.getId(), localPart)
			.update();
		return (updated == 1) ? candidate : current;
	}

	private static @Nullable String cleanIdentityName(@Nullable String name) {
		if (name == null) {
			return null;
		}
		String trimmed = name.strip();
		if (trimmed.isEmpty() || trimmed.codePoints().anyMatch(Character::isISOControl)) {
			return null;
		}
		return (trimmed.length() > MemberRequestParser.MAX_NAME_LENGTH)
				? trimmed.substring(0, MemberRequestParser.MAX_NAME_LENGTH).strip() : trimmed;
	}

	@Transactional(readOnly = true)
	List<TeamMemberDto> list(CurrentMember member) {
		Map<UUID, Integer> load = this.metrics.openTicketsByAssignee(member.organizationId());
		return this.memberships.findTeam(member.organizationId())
			.stream()
			.map((membership) -> TeamMemberDto.from(membership, load.getOrDefault(membership.getUser().getId(), 0)))
			.toList();
	}

	@Transactional(readOnly = true)
	TeamMetricsDto metrics(CurrentMember member) {
		return this.metrics.compute(member.organizationId());
	}

	@Transactional
	TeamMemberDto invite(CurrentMember member, NewInvite request) {
		UUID organizationId = member.organizationId();
		lockTeam(organizationId);
		// El correo de un cliente de la organización (también archivado) nunca entra como agente.
		if (this.customers.emailTaken(organizationId, request.email())) {
			throw new ApiValidationException("email", CUSTOMER_EMAIL);
		}
		UserAccount user = this.directory.findOrCreate(request.name(), request.email());
		Instant now = this.clock.instant();
		Membership membership = this.memberships.findByOrganizationAndUser(organizationId, user.getId())
			.orElse(null);
		if (membership == null) {
			membership = this.memberships.save(new Membership(Ids.newId(),
					this.organizations.getReferenceById(organizationId), user, request.role(), null, now));
		}
		else if (membership.getRole() == Role.CUSTOMER) {
			throw new ApiValidationException("email", CUSTOMER_EMAIL);
		}
		else if (membership.getStatus() != MemberStatus.REMOVED) {
			throw new ApiValidationException("email", ALREADY_MEMBER);
		}
		else {
			membership.reinvite(request.role(), now);
		}
		this.memberships.flush();
		return withLoad(organizationId, membership);
	}

	/**
	 * Orden de errores del contrato: 404, 400 (cuerpo) y 409 (401 y 403 ya los resolvió la capa de seguridad).
	 * Cambiar a su propio rol no hace nada.
	 */
	@Transactional
	TeamMemberDto changeRole(CurrentMember member, UUID userId, Supplier<Role> body) {
		UUID organizationId = member.organizationId();
		lockTeam(organizationId);
		Membership target = findTeamMember(organizationId, userId);
		Role newRole = body.get();
		if (target.getStatus() == MemberStatus.REMOVED) {
			throw new ConflictException("El miembro fue retirado del equipo.");
		}
		if (target.getRole() != newRole) {
			if (isActiveAdmin(target) && this.memberships.countActiveAdmins(organizationId) <= 1) {
				throw new ConflictException(LAST_ADMIN);
			}
			this.guardHook.ifAvailable(MemberGuardHook::afterGuardCheck);
			target.changeRole(newRole);
			this.memberships.flush();
		}
		return withLoad(organizationId, target);
	}

	/**
	 * Retira a un miembro. Primero marca la membresía y hace flush (ese {@code UPDATE} toma el bloqueo de fila que
	 * serializa con las asignaciones) y después libera sus tickets sin resolver en la misma transacción.
	 */
	@Transactional
	TeamMemberDto remove(CurrentMember member, UUID userId) {
		UUID organizationId = member.organizationId();
		lockTeam(organizationId);
		Membership target = findTeamMember(organizationId, userId);
		if (userId.equals(member.userId())) {
			throw new ConflictException("No puedes retirarte a ti mismo del equipo.");
		}
		if (target.getStatus() == MemberStatus.REMOVED) {
			throw new ConflictException("El miembro ya fue retirado del equipo.");
		}
		if (isActiveAdmin(target) && this.memberships.countActiveAdmins(organizationId) <= 1) {
			throw new ConflictException(LAST_ADMIN);
		}
		this.guardHook.ifAvailable(MemberGuardHook::afterGuardCheck);
		Instant now = this.clock.instant();
		target.remove(now);
		this.memberships.flush();
		this.tickets.releaseOpenTickets(member, userId, now);
		return withLoad(organizationId, target);
	}

	/**
	 * Exclusión mutua por organización hasta el commit ({@code pg_advisory_xact_lock}): el cambio de rol, la
	 * retirada y la invitación se evalúan uno a uno. No se usa la fila de la organización porque cada ticket nuevo
	 * la actualiza al reservar su número.
	 */
	private void lockTeam(UUID organizationId) {
		this.jdbc.sql("SELECT count(*) FROM (SELECT pg_advisory_xact_lock(hashtextextended(?, 0))) AS locked")
			.param("team:" + organizationId)
			.query(Long.class)
			.single();
	}

	private Membership findTeamMember(UUID organizationId, UUID userId) {
		return this.memberships.lockTeamMember(organizationId, userId)
			.orElseThrow(() -> new ResourceNotFoundException(UNKNOWN_MEMBER));
	}

	private static boolean isActiveAdmin(Membership membership) {
		return membership.getRole() == Role.ADMIN && membership.getStatus() == MemberStatus.ACTIVE;
	}

	private TeamMemberDto withLoad(UUID organizationId, Membership membership) {
		int open = this.metrics.openTicketsByAssignee(organizationId).getOrDefault(membership.getUser().getId(), 0);
		return TeamMemberDto.from(membership, open);
	}

}
