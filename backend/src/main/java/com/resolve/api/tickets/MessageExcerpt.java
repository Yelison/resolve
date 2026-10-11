package com.resolve.api.tickets;

import java.util.regex.Pattern;

/**
 * Extracto de un mensaje para la bandeja: texto plano de una sola línea. El cuerpo se escribe en Markdown básico
 * (negrita, cursiva, listas y enlaces, como los del editor), así que se quitan las marcas y se conserva el texto.
 */
final class MessageExcerpt {

	static final int MAX_LENGTH = 140;

	/** Cuántos caracteres del cuerpo se leen de la base: de sobra para un extracto, sin traer mensajes enteros. */
	static final int SOURCE_LENGTH = 600;

	private static final String ELLIPSIS = "…";

	private static final Pattern CODE_FENCE = Pattern.compile("(?m)^\\s*(```|~~~).*$");

	private static final Pattern IMAGE = Pattern.compile("!\\[([^\\]]*)]\\([^)]*\\)");

	private static final Pattern LINK = Pattern.compile("\\[([^\\]]*)]\\([^)]*\\)");

	private static final Pattern AUTOLINK = Pattern.compile("<(https?://[^>\\s]+)>");

	private static final Pattern LINE_MARKER = Pattern.compile("(?m)^\\s{0,3}(?:#{1,6}\\s+|>\\s?|[-*+]\\s+|\\d+[.)]\\s+)");

	private static final Pattern STRONG = Pattern.compile("(\\*\\*|__)(?=\\S)(.+?)(?<=\\S)\\1");

	private static final Pattern EMPHASIS = Pattern.compile("(?<![\\w*])([*_])(?=\\S)(.+?)(?<=\\S)\\1(?![\\w*])");

	private static final Pattern INLINE_CODE = Pattern.compile("`([^`]*)`");

	private static final Pattern WHITESPACE = Pattern.compile("\\s+");

	private MessageExcerpt() {
	}

	/** Texto plano de {@code body} con como mucho {@value #MAX_LENGTH} caracteres; si se recorta, termina en «…». */
	static String of(String body) {
		String text = CODE_FENCE.matcher(body).replaceAll("");
		text = IMAGE.matcher(text).replaceAll("$1");
		text = LINK.matcher(text).replaceAll("$1");
		text = AUTOLINK.matcher(text).replaceAll("$1");
		text = LINE_MARKER.matcher(text).replaceAll("");
		text = STRONG.matcher(text).replaceAll("$2");
		text = EMPHASIS.matcher(text).replaceAll("$2");
		text = INLINE_CODE.matcher(text).replaceAll("$1");
		text = WHITESPACE.matcher(text).replaceAll(" ").strip();
		// Se cuenta por puntos de código: cortar por `char` partiría un emoji por la mitad.
		if (text.codePointCount(0, text.length()) <= MAX_LENGTH) {
			return text;
		}
		int end = text.offsetByCodePoints(0, MAX_LENGTH - 1);
		return text.substring(0, end).stripTrailing() + ELLIPSIS;
	}

}
