package com.resolve.api.memberships;

import java.time.Clock;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/** El límite por persona se valida al arrancar: un valor menor que 1 impediría crear espacios a todo el mundo sin avisar. */
class WorkspaceServiceTest {

	@Test
	void aLimitBelowOneStopsTheApplicationFromStarting() {
		JdbcClient jdbc = mock(JdbcClient.class);
		for (int limit : new int[] { 0, -1, Integer.MIN_VALUE }) {
			assertThatThrownBy(() -> new WorkspaceService(jdbc, Clock.systemUTC(), null, null, limit))
				.isInstanceOf(IllegalStateException.class)
				.hasMessageContaining("resolve.organizations.per-person-limit");
		}
		assertThatCode(() -> new WorkspaceService(jdbc, Clock.systemUTC(), null, null, 1)).doesNotThrowAnyException();
	}

}
