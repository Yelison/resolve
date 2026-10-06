package com.resolve.api.memberships;

import java.time.Duration;
import javax.sql.DataSource;

import com.resolve.api.support.RowLock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * La activación de una invitación corre en el filtro del principal, que atiende todas las operaciones: un 503 ahí
 * llegaría a todas. Si otra transacción retiene la membresía no espera: la petición se resuelve igual y la
 * activación se repite en la siguiente.
 */
class InvitationActivationLockTest extends TeamFixture {

	private static final Duration LIMIT = Duration.ofSeconds(20);

	@Autowired
	private DataSource dataSource;

	@Test
	void anInvitationWhoseRowIsHeldIsNotWaitedForAndIsActivatedOnTheNextRequest() throws Exception {
		String before;
		try (RowLock lock = RowLock.hold(this.dataSource,
				"select id from memberships where organization_id = ? and user_id = ? for no key update", this.acme,
				this.invited)) {
			// La petición se resuelve sin esperar: mismo rol y la misma respuesta que tendrá activada.
			ResultActions skipped = assertTimeoutPreemptively(LIMIT, () -> this.mvc.perform(get(API + "/me").with(as(INVITED))));
			skipped.andExpect(status().isOk())
				.andExpect(matchesContract("getMe"))
				.andExpect(jsonPath("$.role").value("agent"))
				.andExpect(jsonPath("$.user.id").value(this.invited.toString()));
			before = skipped.andReturn().getResponse().getContentAsString();
		}

		assertThat(this.data.membershipStatus(this.acme, this.invited)).isEqualTo("invited");
		String after = this.mvc.perform(get(API + "/me").with(as(INVITED)))
			.andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();
		assertThat(this.data.membershipStatus(this.acme, this.invited)).isEqualTo("active");
		assertThat(after).isEqualTo(before);
	}

	@Test
	void anInvitationBeingRemovedIsStillDeactivatedWhenTheRowIsFree() throws Exception {
		this.data.setMembershipStatus(this.acme, this.invited, "removed");

		this.mvc.perform(get(API + "/me").with(as(INVITED))).andExpect(status().isUnauthorized());
		assertThat(this.data.membershipStatus(this.acme, this.invited)).isEqualTo("removed");
	}

}
