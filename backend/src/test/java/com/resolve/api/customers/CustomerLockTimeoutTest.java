package com.resolve.api.customers;

import java.time.Duration;
import javax.sql.DataSource;

import com.resolve.api.support.RowLock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

import static com.resolve.api.support.OpenApiContract.matchesContract;
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
					() -> this.mvc.perform(patch("/customers/" + this.carlosCustomer).with(as(LAURA))
						.contentType("application/merge-patch+json")
						.header("If-Match", "\"0\"")
						.content("{\"company\": \"Otra\"}")));
			edit.andExpect(status().isServiceUnavailable())
				.andExpect(matchesContract("updateCustomer"))
				.andExpect(header().string("Retry-After", "1"));
			ResultActions archive = assertTimeoutPreemptively(LIMIT,
					() -> this.mvc.perform(post("/customers/" + this.carlosCustomer + "/archive").with(as(ADMIN))));
			archive.andExpect(status().isServiceUnavailable()).andExpect(matchesContract("archiveCustomer"));
			ResultActions restore = assertTimeoutPreemptively(LIMIT,
					() -> this.mvc.perform(post("/customers/" + this.carlosCustomer + "/restore").with(as(ADMIN))));
			restore.andExpect(status().isServiceUnavailable())
				.andExpect(matchesContract("restoreCustomer"))
				.andExpect(header().string("Retry-After", "1"));
			ResultActions invite = assertTimeoutPreemptively(LIMIT,
					() -> this.mvc.perform(post("/customers/" + this.carlosCustomer + "/invite").with(as(ADMIN))));
			invite.andExpect(status().isServiceUnavailable())
				.andExpect(matchesContract("inviteCustomer"))
				.andExpect(header().string("Retry-After", "1"));
		}

		this.mvc.perform(post("/customers/" + this.carlosCustomer + "/archive").with(as(ADMIN)))
			.andExpect(status().isOk());
	}

}
