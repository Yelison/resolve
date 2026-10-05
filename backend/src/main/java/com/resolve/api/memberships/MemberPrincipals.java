package com.resolve.api.memberships;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.customers.CustomerRepository;
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

	/** Resultado de resolver una identidad: el principal, o la razón por la que no hay ninguno. */
	public record Resolution(@Nullable CurrentMember member, boolean deactivated) {

		static final Resolution UNKNOWN = new Resolution(null, false);

		static final Resolution DEACTIVATED = new Resolution(null, true);

		static Resolution of(CurrentMember member) {
			return new Resolution(member, false);
		}

	}

	private final MembershipRepository memberships;

	private final CustomerRepository customers;

	private final MemberService members;

	MemberPrincipals(MembershipRepository memberships, CustomerRepository customers, MemberService members) {
		this.memberships = memberships;
		this.customers = customers;
		this.members = members;
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
			return all.isEmpty() ? Resolution.UNKNOWN : Resolution.DEACTIVATED;
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

	/** Organizaciones donde esa identidad puede trabajar, por nombre y después id. */
	public List<OrganizationRefDto> organizationsOf(String email) {
		return usable(this.memberships.findAllByUserEmail(email.trim())).stream()
			.map((membership) -> new OrganizationRefDto(membership.getOrganization().getId(),
					membership.getOrganization().getName()))
			.sorted(Comparator.comparing(OrganizationRefDto::name, String.CASE_INSENSITIVE_ORDER)
				.thenComparing(OrganizationRefDto::id))
			.toList();
	}

	/** Una membresía retirada o la de un cliente archivado no resuelve principal. */
	private List<Membership> usable(List<Membership> all) {
		return all.stream()
			.filter((membership) -> membership.getStatus() != MemberStatus.REMOVED)
			.filter((membership) -> !isArchivedCustomer(membership))
			.toList();
	}

	private boolean isArchivedCustomer(Membership membership) {
		UUID customerId = membership.getCustomerId();
		return customerId != null && this.customers.existsByIdAndArchivedAtIsNotNull(customerId);
	}

	/** Activa la invitación en su propia transacción y confirma el estado final: una retirada concurrente gana. */
	private Resolution enter(Membership membership, @Nullable String identityName) {
		if (membership.getStatus() != MemberStatus.ACTIVE
				&& this.members.activate(membership.getId()) != MemberStatus.ACTIVE) {
			return Resolution.DEACTIVATED;
		}
		UserAccount user = membership.getUser();
		String name = this.members.adoptIdentityName(user, identityName);
		return Resolution.of(new CurrentMember(user.getId(), name, user.getEmail(), membership.getOrganization().getId(),
				membership.getRole(), membership.getCustomerId()));
	}

}
