package com.resolve.api.memberships;

import java.util.List;
import java.util.UUID;

import com.resolve.api.common.persistence.LockTimeouts;
import com.resolve.api.common.security.CurrentMember;
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

	private final UserAccountRepository users;

	private final MeAssembler me;

	private final JdbcClient jdbc;

	MeController(UserAccountRepository users, MeAssembler me, JdbcClient jdbc) {
		this.users = users;
		this.me = me;
		this.jdbc = jdbc;
	}

	@GetMapping("/me")
	@Transactional(readOnly = true)
	MeResponse me(@AuthenticationPrincipal CurrentMember member) {
		return this.me.assemble(member);
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
		return this.me.assemble(member, MemberDto.from(user));
	}

	/**
	 * {@code organizations} lista dónde puede trabajar quien llama; el contrato lo declara opcional. {@code demo} sale de
	 * {@code resolve.demo.enabled}: es de la instalación, no de la organización.
	 */
	record MeResponse(MemberDto user, OrganizationDto organization, List<OrganizationRefDto> organizations,
			OrganizationCreationDto organizationCreation, Role role, @Nullable UUID customerId) {
	}

	record OrganizationDto(UUID id, String name, String timeZone, @Nullable String supportEmail, String color,
			boolean demo) {
	}

	/** Si puede crear otro espacio (con el rol y el límite ya dentro) y cuántos lleva de cuántos. */
	record OrganizationCreationDto(boolean allowed, int created, int limit) {
	}

}
