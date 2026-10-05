package com.resolve.api.memberships;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import com.resolve.api.support.OidcApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Issue #37 con el resolvedor OIDC: la activación del primer acceso tampoco retiene dos conexiones del pool. */
@TestPropertySource(properties = { "spring.datasource.hikari.maximum-pool-size=1",
		"spring.datasource.hikari.connection-timeout=250" })
class OidcInvitedFirstAccessPoolTest extends OidcApiIntegrationTest {

	private static final int INVITED = 6;

	@Test
	@Timeout(60)
	void severalInvitedMembersSigningInTogetherAreAllActivatedWithASingleConnection() throws Exception {
		UUID acme = this.data.organization("Acme");
		this.data.staff(acme, "admin", "Admin", "admin@acme.example");
		Map<String, UUID> invited = new LinkedHashMap<>();
		for (int i = 0; i < INVITED; i++) {
			String email = "invitada" + i + "@acme.example";
			invited.put(email, this.data.staff(acme, "agent", "Invitada " + i, email, "invited"));
		}
		// Calienta Hibernate y el pool: con 250 ms de espera, la primera petición fría no debe agotarla por sí sola.
		this.mvc.perform(get("/me").session(signedIn("admin@acme.example"))).andExpect(status().isOk());

		CountDownLatch start = new CountDownLatch(1);
		ExecutorService executor = Executors.newFixedThreadPool(INVITED);
		try {
			List<Future<MvcResult>> calls = new ArrayList<>();
			for (String email : invited.keySet()) {
				calls.add(executor.submit(() -> {
					start.await();
					return this.mvc.perform(get("/me").session(signedIn(email))).andReturn();
				}));
			}
			start.countDown();
			for (Future<MvcResult> call : calls) {
				MvcResult result = call.get(30, TimeUnit.SECONDS);
				assertThat(result.getResponse().getStatus()).isEqualTo(200);
				matchesContract("getMe").match(result);
			}
		}
		finally {
			executor.shutdownNow();
		}
		invited.forEach((email, userId) -> assertThat(this.data.membershipStatus(acme, userId)).as(email)
			.isEqualTo("active"));
	}

}
