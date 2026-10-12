package com.resolve.api.memberships;

import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.organizations.Organization;
import com.resolve.api.organizations.OrganizationRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Compone {@code Me}: un solo sitio para todas las respuestas que lo devuelven, así ninguna se deja un campo. */
@Component
class MeAssembler {

	private final OrganizationRepository organizations;

	private final MemberPrincipals principals;

	private final WorkspaceService workspaces;

	private final boolean demo;

	MeAssembler(OrganizationRepository organizations, MemberPrincipals principals, WorkspaceService workspaces,
			@Value("${resolve.demo.enabled}") boolean demo) {
		this.organizations = organizations;
		this.principals = principals;
		this.workspaces = workspaces;
		this.demo = demo;
	}

	MeController.MeResponse assemble(CurrentMember member) {
		return assemble(member, new MemberDto(member.userId(), member.name(), member.email()));
	}

	/** {@code user} es la persona tal como está guardada: el principal se resolvió antes de un cambio de nombre. */
	MeController.MeResponse assemble(CurrentMember member, MemberDto user) {
		Organization organization = this.organizations.findById(member.organizationId()).orElseThrow();
		return new MeController.MeResponse(user,
				new MeController.OrganizationDto(organization.getId(), organization.getName(),
						organization.getTimeZone(), organization.getSupportEmail(), organization.getColor(), this.demo),
				this.principals.organizationsOf(member.email()), this.workspaces.creation(member.userId()),
				member.role(), member.customerId());
	}

}
