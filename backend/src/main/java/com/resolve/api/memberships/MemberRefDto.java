package com.resolve.api.memberships;

import java.util.UUID;

/** Miembro mostrado dentro de otros recursos, sin datos de contacto ({@code MemberRef}). */
public record MemberRefDto(UUID id, String name) {

	public static MemberRefDto from(UserAccount user) {
		return new MemberRefDto(user.getId(), user.getName());
	}

}
