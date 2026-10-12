package com.resolve.api.memberships;

import java.time.Clock;

import com.resolve.api.common.security.OrganizationCreationPolicy;
import com.resolve.api.common.security.VerifiedIdentity;
import com.resolve.api.organizations.OrganizationRequestParser.NewOrganization;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.access.AccessDeniedException;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * El límite por persona se valida al arrancar: un valor menor que 1 impediría crear espacios a todo el mundo sin avisar. Y el
 * servicio, que es el que escribe, vuelve a comprobar el modo para una identidad sin membresías: no depende de que la
 * regla de seguridad de {@code POST /organizations} la haya parado antes.
 */
class WorkspaceServiceTest {

	private final JdbcClient jdbc = mock(JdbcClient.class);

	private final UserDirectory users = mock(UserDirectory.class);

	private final OrganizationCreationPolicy closed = new OrganizationCreationPolicy("admins");

	@Test
	void aLimitBelowOneStopsTheApplicationFromStarting() {
		for (int limit : new int[] { 0, -1, Integer.MIN_VALUE }) {
			assertThatThrownBy(() -> new WorkspaceService(this.jdbc, Clock.systemUTC(), this.users, this.closed, limit))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("resolve.organizations.per-person-limit");
		}
		assertThatCode(() -> new WorkspaceService(this.jdbc, Clock.systemUTC(), this.users, this.closed, 1))
			.doesNotThrowAnyException();
	}

	@Test
	void anIdentityWithoutMembershipsIsRefusedWhileTheDoorIsClosedAndNothingIsTouched() {
		WorkspaceService service = new WorkspaceService(this.jdbc, Clock.systemUTC(), this.users, this.closed, 3);

		assertThatThrownBy(() -> service.create(new VerifiedIdentity("nueva@gente.example", "Nueva"),
				new NewOrganization("Espacio", "UTC")))
			.isInstanceOf(AccessDeniedException.class);

		verifyNoInteractions(this.users, this.jdbc);
	}

}
