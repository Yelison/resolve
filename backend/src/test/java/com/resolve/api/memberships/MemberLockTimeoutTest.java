package com.resolve.api.memberships;

import java.time.Duration;
import java.util.UUID;
import javax.sql.DataSource;

import com.resolve.api.support.RowLock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Otra transacción retiene una fila que el cambio de rol o la baja necesitan: responden 503 tras una espera acotada y
 * no dejan nada a medias.
 */
class MemberLockTimeoutTest extends TeamFixture {

	/** Mucho más que el tope del bloqueo: si la petición vuelve a esperar sin límite, el test falla en vez de colgarse. */
	private static final Duration LIMIT = Duration.ofSeconds(20);

	@Autowired
	private DataSource dataSource;

	@Test
	void changingTheRoleOfAHeldMembershipIsA503AndTheRetryWorks() throws Exception {
		try (RowLock lock = holdMembership(this.daniel)) {
			ResultActions blocked = assertTimeoutPreemptively(LIMIT, () -> this.mvc
				.perform(post(API + "/members/" + this.daniel + "/role").with(as(ADMIN))
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"role\": \"admin\"}")));
			expectLockTimeout(blocked, "changeMemberRole");
		}

		assertThat(member(this.daniel).path("role").asString()).isEqualTo("agent");
		this.mvc.perform(post(API + "/members/" + this.daniel + "/role").with(as(ADMIN))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"role\": \"admin\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.role").value("admin"));
	}

	@Test
	void removingAHeldMembershipIsA503AndTheRetryWorks() throws Exception {
		try (RowLock lock = holdMembership(this.daniel)) {
			ResultActions blocked = assertTimeoutPreemptively(LIMIT,
					() -> this.mvc.perform(post(API + "/members/" + this.daniel + "/remove").with(as(ADMIN))));
			expectLockTimeout(blocked, "removeMember");
		}

		assertThat(member(this.daniel).path("status").asString()).isEqualTo("active");
		this.mvc.perform(post(API + "/members/" + this.daniel + "/remove").with(as(ADMIN)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("removed"));
	}

	@Test
	void removingAMemberWhoseOpenTicketIsHeldIsA503AndTheMemberStaysActive() throws Exception {
		UUID ticket = this.data.ticket(this.acme, this.mariaCustomer, 1, "open");
		this.data.assignTicket(ticket, this.laura);

		try (RowLock lock = RowLock.hold(this.dataSource, "select id from tickets where id = ? for no key update",
				ticket)) {
			ResultActions blocked = assertTimeoutPreemptively(LIMIT,
					() -> this.mvc.perform(post(API + "/members/" + this.laura + "/remove").with(as(ADMIN))));
			expectLockTimeout(blocked, "removeMember");
		}

		// La baja se deshizo entera: la membresía que ya se había marcado vuelve a estar activa y el ticket, asignado.
		assertThat(member(this.laura).path("status").asString()).isEqualTo("active");
		this.mvc.perform(get(API + "/tickets/1").with(as(ADMIN)))
			.andExpect(jsonPath("$.assignee.id").value(this.laura.toString()))
			.andExpect(jsonPath("$.version").value(0));
		this.mvc.perform(post(API + "/members/" + this.laura + "/remove").with(as(ADMIN)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("removed"));
	}

	private RowLock holdMembership(UUID userId) throws Exception {
		return RowLock.hold(this.dataSource,
				"select id from memberships where organization_id = ? and user_id = ? for no key update", this.acme,
				userId);
	}

	private static void expectLockTimeout(ResultActions blocked, String operationId) throws Exception {
		blocked.andExpect(status().isServiceUnavailable())
			.andExpect(matchesContract(operationId))
			.andExpect(header().string("Retry-After", "1"))
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.title").value("Recurso ocupado"));
	}

	private JsonNode member(UUID userId) throws Exception {
		for (JsonNode member : listMembers(ADMIN)) {
			if (userId.toString().equals(member.path("id").asString())) {
				return member;
			}
		}
		throw new AssertionError("No aparece el miembro " + userId);
	}

}
