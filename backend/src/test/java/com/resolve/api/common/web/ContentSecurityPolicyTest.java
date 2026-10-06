package com.resolve.api.common.web;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ContentSecurityPolicyTest {

	@Test
	void theBasePolicyIsClosedToEveryOtherOrigin() {
		String policy = ContentSecurityPolicy.build(List.of());

		assertThat(policy).startsWith("default-src 'self'; script-src 'self'; ");
		assertThat(policy).contains("object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'",
				"font-src 'self'", "connect-src 'self'", "form-action 'self'");
		assertThat(policy).doesNotContain("unsafe-inline", "unsafe-eval", "http:", "https:", "*");
	}

	@Test
	void everyInlineScriptOfTheIndexIsAllowedByItsHashAndExternalOnesAreNot() {
		String html = """
				<html><head>
				<script>var theme = 1</script>
				<script type="module" src="/assets/index-3fa9c1.js"></script>
				<script src="/otro.js"></script>
				<script>
				  try { localStorage.getItem('x') } catch (error) {}
				</script>
				<script></script>
				</head></html>""";

		List<String> hashes = ContentSecurityPolicy.hashes(html);

		// SHA-256 en base64 del texto exacto entre las etiquetas: var theme = 1
		assertThat(hashes).hasSize(2);
		assertThat(hashes.get(0)).isEqualTo(sha256("var theme = 1"));
		assertThat(hashes.get(1)).isEqualTo(sha256("\n  try { localStorage.getItem('x') } catch (error) {}\n"));
		assertThat(ContentSecurityPolicy.build(hashes)).contains("script-src 'self' 'sha256-" + hashes.get(0) + "'");
	}

	private static String sha256(String text) {
		try {
			return java.util.Base64.getEncoder()
				.encodeToString(java.security.MessageDigest.getInstance("SHA-256")
					.digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
		}
		catch (java.security.NoSuchAlgorithmException exception) {
			throw new IllegalStateException(exception);
		}
	}

}
