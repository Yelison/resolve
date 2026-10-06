package com.resolve.api.memberships;

import java.util.List;
import java.util.UUID;

import com.resolve.api.common.persistence.LockTimeouts;
import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.organizations.Organization;
import com.resolve.api.organizations.OrganizationRepository;
import org.jspecify.annotations.Nullable;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
class MeController {

	private final OrganizationRepository organizations;

	private final UserAccountRepository users;

	private final MemberPrincipals principals;

	private final JdbcClient jdbc;

	MeController(OrganizationRepository organizations, UserAccountRepository users, MemberPrincipals principals,
			JdbcClient jdbc) {
		this.organizations = organizations;
		this.users = users;
		this.principals = principals;
		this.jdbc = jdbc;
	}

	@GetMapping("/me")
	@Transactional(readOnly = true)
	MeResponse me(@AuthenticationPrincipal CurrentMember member) {
		Organization organization = this.organizations.getReferenceById(member.organizationId());
		return new MeResponse(new MemberDto(member.userId(), member.name(), member.email()),
				organizationDto(organization), this.principals.organizationsOf(member.email()), member.role(),
				member.customerId());
	}

	/**
	 * Cambia el nombre de quien llama. Sin If-Match: es un recurso de un solo dueño y la última escritura gana. El
	 * principal se resolvió antes del cambio y trae el nombre anterior, así que la respuesta lee la cuenta ya guardada.
	 */
	@PatchMapping("/me")
	@Transactional
	MeResponse rename(@AuthenticationPrincipal CurrentMember member, @RequestBody(required = false) @Nullable JsonNode body) {
		String name = MemberRequestParser.profileName(body);
		UserAccount user = this.users.findById(member.userId()).orElseThrow();
		user.rename(name);
		LockTimeouts.limitWait(this.jdbc);
		this.users.flush();
		Organization organization = this.organizations.getReferenceById(member.organizationId());
		return new MeResponse(MemberDto.from(user), organizationDto(organization),
				this.principals.organizationsOf(member.email()), member.role(), member.customerId());
	}

	static OrganizationDto organizationDto(Organization organization) {
		return new OrganizationDto(organization.getId(), organization.getName(), organization.getTimeZone(),
				organization.getSupportEmail());
	}

	/** {@code organizations} lista dónde puede trabajar quien llama; el contrato lo declara opcional. */
	record MeResponse(MemberDto user, OrganizationDto organization, List<OrganizationRefDto> organizations, Role role,
			@Nullable UUID customerId) {
	}

	record OrganizationDto(UUID id, String name, String timeZone, @Nullable String supportEmail) {
	}

}
