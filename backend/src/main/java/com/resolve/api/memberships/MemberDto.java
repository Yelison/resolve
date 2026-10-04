package com.resolve.api.memberships;

import java.util.UUID;

/** Administrador o agente con datos de contacto ({@code Member} en el contrato). */
public record MemberDto(UUID id, String name, String email) {

	static MemberDto from(UserAccount user) {
		return new MemberDto(user.getId(), user.getName(), user.getEmail());
	}

}
