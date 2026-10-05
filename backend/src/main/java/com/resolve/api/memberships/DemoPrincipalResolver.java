package com.resolve.api.memberships;

import java.util.Optional;
import java.util.UUID;

import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.common.security.PrincipalResolver;
import com.resolve.api.customers.CustomerRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Autenticación de demostración, solo en los perfiles {@code dev} y {@code test}: la cabecera {@code X-Demo-User}
 * elige un usuario sembrado por su correo. En {@code dev} hay un usuario por defecto; en {@code test}, no.
 */
@Component
@Profile({ "dev", "test" })
class DemoPrincipalResolver implements PrincipalResolver {

	static final String HEADER = "X-Demo-User";

	private final MembershipRepository memberships;

	private final CustomerRepository customers;

	private final MemberService members;

	private final @Nullable String defaultUser;

	DemoPrincipalResolver(MembershipRepository memberships, CustomerRepository customers, MemberService members,
			@Value("${resolve.demo.default-user:#{null}}") @Nullable String defaultUser) {
		this.memberships = memberships;
		this.customers = customers;
		this.members = members;
		this.defaultUser = defaultUser;
	}

	/**
	 * Sin transacción propia (issue #37): la lectura, la comprobación del cliente archivado y la activación son
	 * llamadas transaccionales sucesivas, así que una petición nunca retiene una conexión del pool mientras pide otra.
	 */
	@Override
	public Optional<CurrentMember> resolve(HttpServletRequest request) {
		String email = request.getHeader(HEADER);
		if (email == null || email.isBlank()) {
			email = this.defaultUser;
		}
		if (email == null) {
			return Optional.empty();
		}
		// Una membresía retirada o la de un cliente archivado no resuelve principal: se pasa a la siguiente o se
		// responde 401. Una invitación se activa en el primer acceso, solo la de la membresía elegida.
		return this.memberships.findAllByUserEmail(email.trim())
			.stream()
			.filter((membership) -> membership.getStatus() != MemberStatus.REMOVED)
			.filter((membership) -> !isArchivedCustomer(membership))
			.findFirst()
			.filter(this::isActiveAfterFirstAccess)
			.map(DemoPrincipalResolver::toMember);
	}

	/** Activa la invitación en su propia transacción y confirma el estado final: una retirada concurrente gana. */
	private boolean isActiveAfterFirstAccess(Membership membership) {
		return membership.getStatus() == MemberStatus.ACTIVE
				|| this.members.activate(membership.getId()) == MemberStatus.ACTIVE;
	}

	private boolean isArchivedCustomer(Membership membership) {
		UUID customerId = membership.getCustomerId();
		return customerId != null && this.customers.existsByIdAndArchivedAtIsNotNull(customerId);
	}

	private static CurrentMember toMember(Membership membership) {
		UserAccount user = membership.getUser();
		return new CurrentMember(user.getId(), user.getName(), user.getEmail(), membership.getOrganization().getId(),
				membership.getRole(), membership.getCustomerId());
	}

}
