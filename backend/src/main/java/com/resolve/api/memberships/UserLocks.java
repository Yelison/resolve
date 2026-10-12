package com.resolve.api.memberships;

import java.util.UUID;

import com.resolve.api.common.persistence.LockTimeouts;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * El bloqueo por persona de sus membresías ({@code user-memberships:{userId}}), que comparten salir de un espacio y
 * crear uno. Las dos reglas miran las membresías de la persona en <i>otras</i> organizaciones (su único espacio utilizable,
 * los espacios que creó y en los que sigue activa) y no comparten el bloqueo del equipo de ninguna: con uno por persona se
 * evalúan una a una. Va <b>siempre antes</b> que el bloqueo del equipo ({@code MemberService#leave} explica por qué).
 */
final class UserLocks {

	private UserLocks() {
	}

	/** Exclusión mutua por persona hasta el commit. */
	static void lockMemberships(JdbcClient jdbc, UUID userId) {
		LockTimeouts.lockAdvisory(jdbc, "user-memberships:" + userId);
	}

}
