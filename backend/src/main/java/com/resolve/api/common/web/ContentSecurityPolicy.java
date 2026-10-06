package com.resolve.api.common.web;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/**
 * La {@code Content-Security-Policy} de la aplicación web: todo del propio origen ({@code default-src 'self'}), con las
 * fuentes empaquetadas y sin CDN, sin {@code object}, sin incrustarse en otro sitio y con los formularios, la base y
 * las conexiones limitados al origen (los formularios, además, al del proveedor de identidad, al que redirige el inicio
 * de sesión).
 *
 * <p>
 * El {@code index.html} lleva un script en línea (aplica el tema guardado antes del primer pintado, para que no haya
 * un destello del tema contrario). En lugar de abrir {@code script-src} a {@code 'unsafe-inline'}, la política admite
 * el hash SHA-256 de cada script en línea que tenga el {@code index.html} de {@code resolve.web.location}, calculado al
 * arrancar: cambiar el script no obliga a tocar esta clase, y un script en línea inyectado no coincide con ningún hash.
 */
@Component
public class ContentSecurityPolicy {

	private static final Pattern INLINE_SCRIPT = Pattern.compile("<script(?![^>]*\\ssrc\\s*=)[^>]*>(.*?)</script>",
			Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

	private final String policy;

	ContentSecurityPolicy(@Value("${resolve.web.location:classpath:/static/}") String location,
			@Value("${spring.security.oauth2.client.provider.resolve.issuer-uri:}") String issuer) {
		this.policy = build(inlineScriptHashes(location.endsWith("/") ? location : location + "/"), origin(issuer));
	}

	/** El valor de la cabecera. */
	public String value() {
		return this.policy;
	}

	static String build(List<String> scriptHashes, List<String> formActionOrigins) {
		StringBuilder scripts = new StringBuilder("script-src 'self'");
		scriptHashes.forEach((hash) -> scripts.append(" 'sha256-").append(hash).append('\''));
		String forms = String.join(" ", "form-action 'self'", String.join(" ", formActionOrigins)).trim();
		return String.join("; ", "default-src 'self'", scripts, "style-src 'self'", "img-src 'self' data:",
				"font-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", forms,
				"frame-ancestors 'none'");
	}

	/**
	 * El origen del proveedor de identidad, si lo hay. Chrome aplica {@code form-action} también a las redirecciones
	 * que siguen al envío de un formulario: sin él, un formulario que enviara a {@code /api/oauth2/authorization/…}
	 * quedaría bloqueado al redirigir al proveedor. Un enlace o {@code location.assign} no pasan por esta directiva.
	 */
	private static List<String> origin(String issuer) {
		if (issuer.isBlank()) {
			return List.of();
		}
		URI uri = URI.create(issuer);
		if (uri.getScheme() == null || uri.getHost() == null) {
			return List.of();
		}
		return List.of(uri.getScheme() + "://" + uri.getHost() + (uri.getPort() >= 0 ? ":" + uri.getPort() : ""));
	}

	private static List<String> inlineScriptHashes(String location) {
		Resource index = new DefaultResourceLoader().getResource(location + "index.html");
		if (!index.exists()) {
			// Sin aplicación web (por ejemplo, la API sola en un test) no hay scripts que admitir.
			return List.of();
		}
		try (InputStream content = index.getInputStream()) {
			return hashes(new String(content.readAllBytes(), StandardCharsets.UTF_8));
		}
		catch (IOException exception) {
			throw new IllegalStateException("No se pudo leer " + index + " para calcular la política de contenido",
					exception);
		}
	}

	static List<String> hashes(String html) {
		List<String> hashes = new ArrayList<>();
		Matcher scripts = INLINE_SCRIPT.matcher(html);
		while (scripts.find()) {
			String script = scripts.group(1);
			if (!script.isBlank()) {
				hashes.add(sha256(script));
			}
		}
		return hashes;
	}

	private static String sha256(String script) {
		try {
			byte[] digest = MessageDigest.getInstance("SHA-256").digest(script.getBytes(StandardCharsets.UTF_8));
			return Base64.getEncoder().encodeToString(digest);
		}
		catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException(exception);
		}
	}

}
