package com.resolve.api.memberships;

import java.time.Duration;
import java.util.UUID;
import javax.sql.DataSource;

import com.resolve.api.support.RowLock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Las esperas que no pasan por el bloqueo de una fila del miembro (#69): el advisory lock del equipo, la
 * reinvitación de una membresía retenida y la cuenta del usuario. Todas responden 503 y no dejan nada a medias; la
 * activación de una invitación, que corre en el filtro del principal, no espera: se salta.
 */
class TeamLockTimeoutTest extends TeamFixture {

	private static final Duration LIMIT = Duration.ofSeconds(20);

	@Autowired
	private DataSource dataSource;

	@Test
	void invitingChangingTheRoleAndRemovingWhileTheTeamLockIsHeldAreA503() throws Exception {
		try (RowLock lock = holdTeamLock()) {
			ResultActions invite = assertTimeoutPreemptively(LIMIT, () -> this.mvc.perform(post(API + "/members")
				.with(as(ADMIN))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\": \"nueva@acme.example\", \"name\": \"Nueva\", \"role\": \"agent\"}")));
			expectLockTimeout(invite, "inviteMember");
			ResultActions role = assertTimeoutPreemptively(LIMIT,
					() -> this.mvc.perform(post(API + "/members/" + this.daniel + "/role").with(as(ADMIN))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"role\": \"admin\"}")));
			expectLockTimeout(role, "changeMemberRole");
			ResultActions remove = assertTimeoutPreemptively(LIMIT,
					() -> this.mvc.perform(post(API + "/members/" + this.daniel + "/remove").with(as(ADMIN))));
			expectLockTimeout(remove, "removeMember");
		}

		assertThat(invite(ADMIN, "{\"email\": \"nueva@acme.example\", \"name\": \"Nueva\", \"role\": \"agent\"}")
			.getResponse()
			.getStatus()).isEqualTo(201);
	}

	@Test
	void invitingAgainARemovedMemberWhoseRowIsHeldIsA503AndTheRetryWorks() throws Exception {
		try (RowLock lock = RowLock.hold(this.dataSource,
				"select id from memberships where organization_id = ? and user_id = ? for no key update", this.acme,
				this.removed)) {
			ResultActions blocked = assertTimeoutPreemptively(LIMIT, () -> this.mvc.perform(post(API + "/members")
				.with(as(ADMIN))
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\": \"" + REMOVED + "\", \"name\": \"Raúl Retirado\", \"role\": \"agent\"}")));
			expectLockTimeout(blocked, "inviteMember");
		}

		assertThat(this.data.membershipStatus(this.acme, this.removed)).isEqualTo("removed");
		assertThat(invite(ADMIN, "{\"email\": \"" + REMOVED + "\", \"name\": \"Raúl Retirado\", \"role\": \"agent\"}")
			.getResponse()
			.getStatus()).isEqualTo(201);
		assertThat(this.data.membershipStatus(this.acme, this.removed)).isEqualTo("invited");
	}

	@Test
	void renamingWhileTheUserRowIsHeldIsA503AndTheRetryWorks() throws Exception {
		try (RowLock lock = RowLock.hold(this.dataSource, "select id from users where id = ? for no key update",
				this.laura)) {
			ResultActions blocked = assertTimeoutPreemptively(LIMIT,
					() -> this.mvc.perform(patch(API + "/me").with(as(LAURA))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"name\": \"Laura Nueva\"}")));
			expectLockTimeout(blocked, "updateMe");
		}

		this.mvc.perform(get(API + "/me").with(as(LAURA))).andExpect(jsonPath("$.user.name").value("Laura Méndez"));
		this.mvc.perform(patch(API + "/me").with(as(LAURA))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\": \"Laura Nueva\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.user.name").value("Laura Nueva"));
	}

	private RowLock holdTeamLock() throws Exception {
		return RowLock.hold(this.dataSource,
				"select 1 from (select pg_advisory_xact_lock(hashtextextended(?, 0))) as locked", "team:" + this.acme);
	}

	private static void expectLockTimeout(ResultActions blocked, String operationId) throws Exception {
		blocked.andExpect(status().isServiceUnavailable())
			.andExpect(matchesContract(operationId))
			.andExpect(header().string("Retry-After", "1"))
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.title").value("Recurso ocupado"));
	}

}
