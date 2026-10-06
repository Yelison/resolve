package com.resolve.api.memberships;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Una retirada que se confirma entre la lectura de la membresía como {@code invited} y su activación gana: el
 * resolvedor del principal responde 401 y la membresía sigue retirada. Es la comprobación de {@code enter} que no
 * cubre un miembro ya retirado antes de la petición, que {@code usable()} descarta sin llegar a activar.
 */
class InvitedThenRemovedRaceTest extends TeamFixture {

	@MockitoSpyBean
	private MemberService members;

	@Test
	void aRemovalCommittedBeforeTheActivationWins() throws Exception {
		doAnswer((invocation) -> {
			this.data.setMembershipStatus(this.acme, this.invited, "removed");
			return invocation.callRealMethod();
		}).when(this.members).activate(any());

		this.mvc.perform(get(API + "/me").with(as(INVITED)))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("getMe"));

		assertThat(this.data.membershipStatus(this.acme, this.invited)).isEqualTo("removed");
	}

}
