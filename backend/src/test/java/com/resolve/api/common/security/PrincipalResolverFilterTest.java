package com.resolve.api.common.security;

import java.util.Optional;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** La identidad se resuelve solo bajo {@code /api}: la aplicación web no debe costar una consulta por archivo. */
class PrincipalResolverFilterTest {

	private final PrincipalResolver resolver = mock(PrincipalResolver.class);

	private final PrincipalResolverFilter filter = new PrincipalResolverFilter(this.resolver);

	private final FilterChain chain = mock(FilterChain.class);

	@Test
	void theWebAppAndItsAssetsNeverReachTheResolver() throws Exception {
		for (String path : new String[] { "/", "/tickets/1047", "/assets/x.js", "/favicon.svg", "/apice", "/error" }) {
			MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
			MockHttpServletResponse response = new MockHttpServletResponse();

			this.filter.doFilter(request, response, this.chain);

			verify(this.chain).doFilter(request, response);
		}
		verifyNoInteractions(this.resolver);
	}

	@Test
	void theApiResolvesTheCallerOncePerRequest() throws Exception {
		when(this.resolver.resolve(any())).thenReturn(Optional.empty());
		for (String path : new String[] { "/api/me", "/api/tickets/1047", "/api" }) {
			MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
			MockHttpServletResponse response = new MockHttpServletResponse();

			this.filter.doFilter(request, response, this.chain);

			verify(this.resolver).resolve(request);
			verify(this.chain).doFilter(request, response);
		}
	}

}
