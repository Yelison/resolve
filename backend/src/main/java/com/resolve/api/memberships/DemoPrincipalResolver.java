package com.resolve.api.memberships;

import java.util.Optional;

import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.common.security.PrincipalResolver;
import com.resolve.api.common.security.SessionOrganization;
import jakarta.servlet.http.HttpServletRequest;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Autenticación de demostración, solo en los perfiles {@code dev} y {@code test} y nunca junto a {@code oidc}: la
 * cabecera {@code X-Demo-User} elige un usuario sembrado por su correo. En {@code dev} hay un usuario por defecto; en
 * {@code test}, no.
 *
 * <p>
 * Sin transacción propia (issue #37): {@link MemberPrincipals} encadena la lectura, la comprobación del cliente
 * archivado y la activación como llamadas transaccionales sucesivas, así que una petición nunca retiene una conexión
 * del pool mientras pide otra.
 */
@Component
@Profile("(dev | test) & !oidc")
class DemoPrincipalResolver implements PrincipalResolver {

	static final String HEADER = "X-Demo-User";

	private final MemberPrincipals principals;

	private final @Nullable String defaultUser;

	DemoPrincipalResolver(MemberPrincipals principals,
			@Value("${resolve.demo.default-user:#{null}}") @Nullable String defaultUser) {
		this.principals = principals;
		this.defaultUser = defaultUser;
	}

	@Override
	public Optional<CurrentMember> resolve(HttpServletRequest request) {
		String email = request.getHeader(HEADER);
		if (email == null || email.isBlank()) {
			email = this.defaultUser;
		}
		if (email == null) {
			return Optional.empty();
		}
		MemberPrincipals.Resolution resolution = this.principals.resolve(email, SessionOrganization.read(request), null);
		if (resolution.deactivated()) {
			request.setAttribute(DEACTIVATED_ATTRIBUTE, Boolean.TRUE);
		}
		else if (resolution.noMembership()) {
			request.setAttribute(NO_MEMBERSHIP_ATTRIBUTE, Boolean.TRUE);
		}
		return Optional.ofNullable(resolution.member());
	}

}
