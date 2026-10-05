package com.resolve.api.common.security;

import java.util.Optional;

import com.resolve.api.memberships.MemberPrincipals;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Component;

/**
 * Perfil {@code oidc}: el correo verificado que el proveedor de identidad dejó en la sesión se traduce, en cada
 * petición, en la membresía de la base de datos. Por eso retirar a alguien o archivar a su cliente surte efecto en la
 * petición siguiente aunque su sesión siga viva, y el principal resuelto nunca se guarda en la sesión.
 *
 * <p>
 * Un correo que el proveedor no marca como verificado no autentica: de lo contrario, con otro proveedor, bastaría
 * registrar la cuenta ajena para activar su invitación.
 */
@Component
@Profile("oidc")
class OidcPrincipalResolver implements PrincipalResolver {

	private final MemberPrincipals principals;

	OidcPrincipalResolver(MemberPrincipals principals) {
		this.principals = principals;
	}

	@Override
	public Optional<CurrentMember> resolve(HttpServletRequest request) {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (!(authentication instanceof OAuth2AuthenticationToken token) || !token.isAuthenticated()
				|| !(token.getPrincipal() instanceof OidcUser user)) {
			return Optional.empty();
		}
		String email = user.getEmail();
		if (email == null || email.isBlank() || !Boolean.TRUE.equals(user.getEmailVerified())) {
			return Optional.empty();
		}
		MemberPrincipals.Resolution resolution = this.principals.resolve(email, SessionOrganization.read(request),
				user.getFullName());
		if (resolution.deactivated()) {
			request.setAttribute(DEACTIVATED_ATTRIBUTE, Boolean.TRUE);
		}
		return Optional.ofNullable(resolution.member());
	}

}
