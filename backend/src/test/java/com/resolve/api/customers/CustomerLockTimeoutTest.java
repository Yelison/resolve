package com.resolve.api.customers;

import java.time.Duration;
import java.util.UUID;
import javax.sql.DataSource;

import com.resolve.api.support.RowLock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Otra transacción retiene la fila del cliente: las escrituras responden 503 tras una espera acotada. */
class CustomerLockTimeoutTest extends CustomersFixture {

	private static final Duration LIMIT = Duration.ofSeconds(20);

	@Autowired
	private DataSource dataSource;

	@Test
	void editArchiveRestoreAndInviteAnswer503WhileTheRowIsHeld() throws Exception {
		try (RowLock lock = RowLock.hold(this.dataSource, "select id from customers where id = ? for no key update",
				this.carlosCustomer)) {
			ResultActions edit = assertTimeoutPreemptively(LIMIT,
					() -> this.mvc.perform(patch(API + "/customers/" + this.carlosCustomer).with(as(LAURA))
						.contentType("application/merge-patch+json")
						.header("If-Match", "\"0\"")
						.content("{\"company\": \"Otra\"}")));
			edit.andExpect(status().isServiceUnavailable())
				.andExpect(matchesContract("updateCustomer"))
				.andExpect(header().string("Retry-After", "1"));
			ResultActions archive = assertTimeoutPreemptively(LIMIT,
					() -> this.mvc.perform(post(API + "/customers/" + this.carlosCustomer + "/archive").with(as(ADMIN))));
			archive.andExpect(status().isServiceUnavailable()).andExpect(matchesContract("archiveCustomer"));
			ResultActions restore = assertTimeoutPreemptively(LIMIT,
					() -> this.mvc.perform(post(API + "/customers/" + this.carlosCustomer + "/restore").with(as(ADMIN))));
			restore.andExpect(status().isServiceUnavailable())
				.andExpect(matchesContract("restoreCustomer"))
				.andExpect(header().string("Retry-After", "1"));
			ResultActions invite = assertTimeoutPreemptively(LIMIT,
					() -> this.mvc.perform(post(API + "/customers/" + this.carlosCustomer + "/invite").with(as(ADMIN))));
			invite.andExpect(status().isServiceUnavailable())
				.andExpect(matchesContract("inviteCustomer"))
				.andExpect(header().string("Retry-After", "1"));
		}

		this.mvc.perform(post(API + "/customers/" + this.carlosCustomer + "/archive").with(as(ADMIN)))
			.andExpect(status().isOk());
	}

	@Test
	void invitingAgainARemovedPortalAccessWhoseMembershipIsHeldIs503AndTheRetryWorks() throws Exception {
		UUID customer = this.data.customer(this.acme, "Cliente Retirado", "retirado@cliente.example", null);
		UUID user = this.data.customerUser(this.acme, customer, "Cliente Retirado", "retirado@cliente.example",
				"removed");

		try (RowLock lock = RowLock.hold(this.dataSource,
				"select id from memberships where organization_id = ? and user_id = ? for no key update", this.acme,
				user)) {
			ResultActions blocked = assertTimeoutPreemptively(LIMIT,
					() -> this.mvc.perform(post(API + "/customers/" + customer + "/invite").with(as(ADMIN))));
			blocked.andExpect(status().isServiceUnavailable())
				.andExpect(matchesContract("inviteCustomer"))
				.andExpect(header().string("Retry-After", "1"));
		}

		assertThat(this.data.membershipStatus(this.acme, user)).isEqualTo("removed");
		this.mvc.perform(post(API + "/customers/" + customer + "/invite").with(as(ADMIN))).andExpect(status().isCreated());
		assertThat(this.data.membershipStatus(this.acme, user)).isEqualTo("invited");
	}

}
