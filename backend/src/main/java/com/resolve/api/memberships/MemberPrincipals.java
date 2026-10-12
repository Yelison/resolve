package com.resolve.api.memberships;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.common.security.PrincipalResolver;
import com.resolve.api.common.security.VerifiedIdentity;
import jakarta.servlet.http.HttpServletRequest;
import org.jspecify.annotations.Nullable;
import org.springframework.stereotype.Component;

/**
 * Traduce un correo ya verificado (el de la cabecera de demostración o el del proveedor OIDC) en el principal de la
 * API: la membresía utilizable, activada si estaba invitada, con la organización y el rol que le corresponden.
 *
 * <p>
 * No abre ninguna transacción (issue #37): la lectura, la comprobación del cliente archivado, la activación y el
 * cambio de nombre son llamadas transaccionales sucesivas, así que una petición nunca retiene una conexión del pool
 * mientras pide otra.
 */
@Component
public class MemberPrincipals {

	/**
	 * Resultado de resolver una identidad: el principal, o la razón por la que no hay ninguno. {@code identity} solo existe
	 * cuando no hay ninguna membresía ({@link #noMembership()}): quién es esa persona, para que el {@code 401} la salude.
	 */
	public record Resolution(@Nullable CurrentMember member, boolean deactivated, @Nullable VerifiedIdentity identity) {

		static final Resolution DEACTIVATED = new Resolution(null, true, null);

		/** La identidad no tiene ninguna membresía (ni siquiera una retirada): no es lo mismo que haberla perdido. */
		public boolean noMembership() {
			return this.member == null && !this.deactivated;
		}

		static Resolution of(CurrentMember member) {
			return new Resolution(member, false, null);
		}

		static Resolution withoutMembership(VerifiedIdentity identity) {
			return new Resolution(null, false, identity);
		}

		/**
		 * Deja en la petición por qué no hay principal, para el {@code 401}: acceso desactivado, o sin ninguna membresía
		 * (y entonces quién es la persona, que la regla de {@code POST /organizations} lee cuando el alta está abierta).
		 */
		public void describeTo(HttpServletRequest request) {
			if (deactivated()) {
				request.setAttribute(PrincipalResolver.DEACTIVATED_ATTRIBUTE, Boolean.TRUE);
			}
			else if (noMembership()) {
				request.setAttribute(PrincipalResolver.NO_MEMBERSHIP_ATTRIBUTE, Boolean.TRUE);
				if (this.identity != null) {
					request.setAttribute(PrincipalResolver.IDENTITY_ATTRIBUTE, this.identity);
				}
			}
		}

	}

	private final MembershipRepository memberships;

	private final MemberService members;

	private final UserAccountRepository users;

	MemberPrincipals(MembershipRepository memberships, MemberService members, UserAccountRepository users) {
		this.memberships = memberships;
		this.members = members;
		this.users = users;
	}

	/**
	 * Principal de ese correo. Con varias membresías utilizables gana la de la organización preferida (la guardada en
	 * la sesión) y, si no hay o ya no es utilizable, la primera por id. Solo se activa la membresía elegida.
	 * @param identityName nombre que da el proveedor de identidad, o {@code null}: sustituye al nombre guardado solo si
	 * este está vacío o es la parte local del correo
	 */
	public Resolution resolve(String email, @Nullable UUID preferredOrganizationId, @Nullable String identityName) {
		List<Membership> all = this.memberships.findAllByUserEmail(email.trim());
		List<Membership> usable = usable(all);
		if (usable.isEmpty()) {
			return all.isEmpty() ? Resolution.withoutMembership(identityOf(email.trim(), identityName))
					: Resolution.DEACTIVATED;
		}
		Membership chosen = usable.stream()
			.filter((membership) -> membership.getOrganization().getId().equals(preferredOrganizationId))
			.findFirst()
			.orElse(usable.get(0));
		return enter(chosen, identityName);
	}

	/** Principal en esa organización, o vacío si la identidad no tiene allí una membresía utilizable (ajena o inexistente). */
	public Optional<CurrentMember> resolveIn(String email, UUID organizationId) {
		return usable(this.memberships.findAllByUserEmail(email.trim())).stream()
			.filter((membership) -> membership.getOrganization().getId().equals(organizationId))
			.findFirst()
			.map((membership) -> enter(membership, null).member());
	}

	/**
	 * Organizaciones donde esa identidad puede trabajar, por nombre y después id, con su rol allí y el tamaño del
	 * equipo. Los tamaños salen de una sola consulta agrupada para todas las organizaciones de la persona, no de una por
	 * organización.
	 */
	public List<OrganizationRefDto> organizationsOf(String email) {
		List<Membership> usable = usable(this.memberships.findAllByUserEmail(email.trim()));
		List<UUID> staffOrganizations = usable.stream()
			.filter((membership) -> membership.getRole().isStaff())
			.map((membership) -> membership.getOrganization().getId())
			.toList();
		Map<UUID, Long> staff = staffOrganizations.isEmpty() ? Map.of()
				: this.memberships.countActiveStaff(staffOrganizations)
					.stream()
					.collect(Collectors.toMap(StaffCount::organizationId,
							StaffCount::count));
		return usable.stream()
			.map((membership) -> new OrganizationRefDto(membership.getOrganization().getId(),
					membership.getOrganization().getName(), membership.getRole(),
					membership.getOrganization().getColor(), membership.getRole().isStaff()
							? Math.toIntExact(staff.getOrDefault(membership.getOrganization().getId(), 0L)) : null))
			.sorted(Comparator.comparing(OrganizationRefDto::name, String.CASE_INSENSITIVE_ORDER)
				.thenComparing(OrganizationRefDto::id))
			.toList();
	}

	/**
	 * Quién es una identidad sin membresías: el nombre que da el proveedor; si no, el que ya tiene su cuenta (puede haber
	 * una sin membresías, como la del usuario de demostración que aún no creó su espacio) y, si tampoco, la parte local del
	 * correo. Nunca vacío. No crea ninguna cuenta: eso lo hace {@code POST /organizations}, cuando la persona crea su espacio.
	 */
	private VerifiedIdentity identityOf(String email, @Nullable String identityName) {
		String name = MemberService.cleanIdentityName(identityName);
		if (name == null) {
			name = this.users.findByEmailIgnoreCase(email)
				.map(UserAccount::getName)
				.map(String::strip)
				.filter((stored) -> !stored.isEmpty())
				.orElseGet(() -> localPart(email));
		}
		return new VerifiedIdentity(email, name);
	}

	private static String localPart(String email) {
		int at = email.indexOf('@');
		String local = (at > 0) ? email.substring(0, at) : email;
		return local.substring(0, Math.min(MemberRequestParser.MAX_NAME_LENGTH, local.length()));
	}

	/** Una membresía retirada o la de un cliente archivado no resuelve principal (ver {@link MemberService#isUsable}). */
	private List<Membership> usable(List<Membership> all) {
		return all.stream()
			.filter((membership) -> this.members.isUsable(membership.getStatus(), membership.getCustomerId()))
			.toList();
	}

	/**
	 * Activa la invitación en su propia transacción y confirma el estado final: una retirada concurrente gana. Si la
	 * membresía está retenida por otra transacción la activación se salta y la persona entra igual, con el mismo
	 * rol, pero la petición la ve aún {@code invited}: lo que lista solo a los miembros activos (responsables,
	 * métricas del equipo, reportes) no la incluye todavía y autoasignarse es un 400. Nunca gana permisos; la
	 * siguiente petición la activa.
	 */
	private Resolution enter(Membership membership, @Nullable String identityName) {
		if (membership.getStatus() != MemberStatus.ACTIVE
				&& this.members.activate(membership.getId()) == MemberStatus.REMOVED) {
			return Resolution.DEACTIVATED;
		}
		UserAccount user = membership.getUser();
		String name = this.members.adoptIdentityName(user, identityName);
		return Resolution.of(new CurrentMember(user.getId(), name, user.getEmail(), membership.getOrganization().getId(),
				membership.getRole(), membership.getCustomerId()));
	}

}
