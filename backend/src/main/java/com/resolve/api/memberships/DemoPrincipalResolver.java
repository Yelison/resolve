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
import org.springframework.transaction.annotation.Transactional;

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

	private final @Nullable String defaultUser;

	DemoPrincipalResolver(MembershipRepository memberships, CustomerRepository customers,
			@Value("${resolve.demo.default-user:#{null}}") @Nullable String defaultUser) {
		this.memberships = memberships;
		this.customers = customers;
		this.defaultUser = defaultUser;
	}

	@Override
	@Transactional(readOnly = true)
	public Optional<CurrentMember> resolve(HttpServletRequest request) {
		String email = request.getHeader(HEADER);
		if (email == null || email.isBlank()) {
			email = this.defaultUser;
		}
		if (email == null) {
			return Optional.empty();
		}
		// La membresía de un cliente archivado no resuelve principal: se pasa a la siguiente o se responde 401.
		return this.memberships.findAllByUserEmail(email.trim())
			.stream()
			.filter((membership) -> !isArchivedCustomer(membership))
			.findFirst()
			.map(DemoPrincipalResolver::toMember);
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
