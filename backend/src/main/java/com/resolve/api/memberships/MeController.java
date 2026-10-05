package com.resolve.api.memberships;

import java.util.UUID;

import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.organizations.Organization;
import com.resolve.api.organizations.OrganizationRepository;
import org.jspecify.annotations.Nullable;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class MeController {

	private final OrganizationRepository organizations;

	MeController(OrganizationRepository organizations) {
		this.organizations = organizations;
	}

	@GetMapping("/me")
	@Transactional(readOnly = true)
	MeResponse me(@AuthenticationPrincipal CurrentMember member) {
		Organization organization = this.organizations.getReferenceById(member.organizationId());
		return new MeResponse(new MemberDto(member.userId(), member.name(), member.email()),
				new OrganizationDto(organization.getId(), organization.getName(), organization.getTimeZone(),
						organization.getSupportEmail()),
				member.role(), member.customerId());
	}

	record MeResponse(MemberDto user, OrganizationDto organization, Role role, @Nullable UUID customerId) {
	}

	record OrganizationDto(UUID id, String name, String timeZone, @Nullable String supportEmail) {
	}

}
