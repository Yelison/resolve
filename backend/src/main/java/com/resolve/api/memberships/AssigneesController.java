package com.resolve.api.memberships;

import java.util.List;

import com.resolve.api.common.security.CurrentMember;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Miembros que pueden ser responsables de un ticket: administradores y agentes de la organización. */
@RestController
class AssigneesController {

	private final MembershipRepository memberships;

	AssigneesController(MembershipRepository memberships) {
		this.memberships = memberships;
	}

	@GetMapping("/assignees")
	@Transactional(readOnly = true)
	List<MemberDto> assignees(@AuthenticationPrincipal CurrentMember member) {
		return this.memberships.findStaff(member.organizationId())
			.stream()
			.map((membership) -> MemberDto.from(membership.getUser()))
			.toList();
	}

}
