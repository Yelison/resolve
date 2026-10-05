package com.resolve.api.common.security;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DemoAuthenticationTest extends ApiIntegrationTest {

	@Test
	void withoutHeaderTheTestProfileHasNoDefaultUser() throws Exception {
		this.mvc.perform(get(API + "/me")).andExpect(status().isUnauthorized()).andExpect(matchesContract("getMe"));
	}

	@Test
	void anUnknownUserIsNotAuthenticated() throws Exception {
		this.mvc.perform(get(API + "/me").with(as("nadie@example.com")))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("getMe"));
	}

}
