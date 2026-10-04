package com.resolve.api.common.security;

import java.util.List;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

/** Autenticación ya resuelta de un {@link CurrentMember}; la autoridad es su rol ({@code ROLE_ADMIN}, …). */
public class MemberAuthentication extends AbstractAuthenticationToken {

	private final CurrentMember member;

	public MemberAuthentication(CurrentMember member) {
		super(List.of(new SimpleGrantedAuthority("ROLE_" + member.role().name())));
		this.member = member;
		setAuthenticated(true);
	}

	@Override
	public Object getCredentials() {
		return "";
	}

	@Override
	public CurrentMember getPrincipal() {
		return this.member;
	}

}
