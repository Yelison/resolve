package com.resolve.api.common.web;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.resolve.api.common.error.ApiValidationException;
import com.resolve.api.common.error.PreconditionRequiredException;
import org.jspecify.annotations.Nullable;

/** Lectura de la cabecera If-Match, común a todos los recursos con control de versión. */
public final class Preconditions {

	private static final Pattern STRONG_ETAG = Pattern.compile("^\"(\\d{1,18})\"$");

	private Preconditions() {
	}

	/**
	 * Versión de una cabecera If-Match: un único validador fuerte {@code "<n>"}. Sin cabecera responde 428; un
	 * validador débil, una lista o {@code *} son un error de validación del campo {@code If-Match}.
	 * @param resource nombre del recurso en el mensaje del 428, por ejemplo «ticket» o «cliente»
	 */
	public static long requireVersion(@Nullable String ifMatch, String resource) {
		if (ifMatch == null || ifMatch.isBlank()) {
			throw new PreconditionRequiredException(
					"Envía If-Match con la versión del " + resource + " que estás editando.");
		}
		Matcher matcher = STRONG_ETAG.matcher(ifMatch.trim());
		if (!matcher.matches()) {
			throw new ApiValidationException("If-Match", "Envía la versión entre comillas, como en la cabecera ETag.");
		}
		return Long.parseLong(matcher.group(1));
	}

}
