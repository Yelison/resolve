package com.resolve.api.memberships;

import java.util.List;
import java.util.function.Supplier;

import com.resolve.api.common.security.CurrentMember;
import com.resolve.api.memberships.MemberDtos.TeamMemberDto;
import com.resolve.api.memberships.MemberDtos.TeamMetricsDto;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** Equipo de la organización: lectura para el personal y escritura solo para administradores (URL en seguridad). */
@RestController
class MembersController {

	private final MemberService service;

	MembersController(MemberService service) {
		this.service = service;
	}

	@GetMapping("/members")
	List<TeamMemberDto> list(@AuthenticationPrincipal CurrentMember member) {
		return this.service.list(member);
	}

	@GetMapping("/members/metrics")
	TeamMetricsDto metrics(@AuthenticationPrincipal CurrentMember member) {
		return this.service.metrics(member);
	}

	@PostMapping("/members")
	ResponseEntity<TeamMemberDto> invite(@AuthenticationPrincipal CurrentMember member,
			@RequestBody(required = false) @Nullable JsonNode body) {
		TeamMemberDto invited = this.service.invite(member, MemberRequestParser.invite(body));
		return ResponseEntity.status(HttpStatus.CREATED).body(invited);
	}

	/** El cuerpo se valida dentro del servicio, después de buscar al miembro. */
	@PostMapping("/members/{userId}/role")
	TeamMemberDto changeRole(@AuthenticationPrincipal CurrentMember member, @PathVariable String userId,
			@RequestBody(required = false) @Nullable JsonNode body) {
		Supplier<Role> role = () -> MemberRequestParser.roleChange(body);
		return this.service.changeRole(member, MemberRequestParser.userId(userId), role);
	}

	@PostMapping("/members/{userId}/remove")
	TeamMemberDto remove(@AuthenticationPrincipal CurrentMember member, @PathVariable String userId) {
		return this.service.remove(member, MemberRequestParser.userId(userId));
	}

}
