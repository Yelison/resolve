package com.resolve.api.knowledge;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Extracto de un artículo para las listas: texto plano de hasta {@value #MAX_LENGTH} caracteres sacado del cuerpo
 * Markdown. No es un renderizador: quita la sintaxis que ensuciaría una línea de resumen y se queda con el texto
 * legible. Se calcula al leer, sobre el cuerpo que la consulta de la lista ya carga.
 * <p>
 * El resultado es texto, nunca HTML: las etiquetas se quitan y lo que quede se debe pintar como texto. Como el cuerpo
 * mide como máximo 20 000 caracteres y las expresiones regulares no anidan cuantificadores ni retroceden, el coste
 * por artículo es lineal; además se deja de leer en cuanto hay texto de sobra para el extracto.
 */
final class Excerpts {

	/** Longitud máxima en puntos de código, contando la elipsis final. */
	static final int MAX_LENGTH = 160;

	private static final String ELLIPSIS = "…";

	/** Un enlace o imagen en línea; los corchetes y paréntesis internos no admiten anidamiento a propósito. */
	private static final Pattern INLINE_LINK = Pattern.compile("!?\\[([^\\[\\]]*)]\\([^()]*\\)");

	private static final Pattern REFERENCE_LINK = Pattern.compile("!?\\[([^\\[\\]]*)]\\[[^\\[\\]]*]");

	/** Una etiqueta HTML; con `[^<>]*` no retrocede y puede ocupar varias líneas porque se aplica al texto ya unido. */
	private static final Pattern TAG = Pattern.compile("</?[A-Za-z][^<>]*>");

	/** Salvaguarda: un {@code <} seguido de letra o barra que sobreviva (etiqueta sin cerrar, texto cortado). */
	private static final Pattern STRAY_TAG_START = Pattern.compile("<(?=[A-Za-z/])");

	/** Autoenlaces {@code <https://…>}, {@code <mailto:…>} y {@code <correo@dominio>}: se conserva su contenido. */
	private static final Pattern AUTOLINK = Pattern
		.compile("<((?:https?://|mailto:)[^<>\\s]+|[^<>\\s@]+@[^<>\\s]+)>");

	/** Énfasis con asteriscos: pegados a texto por un lado, no un {@code *} suelto como en «2 * 3». */
	private static final Pattern STAR_EMPHASIS = Pattern.compile("\\*+(?=\\S)|(?<=\\S)\\*+");

	/** Subrayado de un encabezado setext. */
	private static final Pattern SETEXT_UNDERLINE = Pattern.compile("^=+\\s*$");

	private static final Pattern LIST_MARKER = Pattern.compile("^(?:[-*+]|\\d{1,9}[.)])\\s+(?:\\[[ xX]]\\s+)?");

	private static final Pattern REFERENCE_DEFINITION = Pattern.compile("^\\[[^\\[\\]]+]:\\s.*");

	/** El énfasis con guiones bajos solo cuenta en el borde de una palabra: {@code snake_case} se conserva. */
	private static final Pattern UNDERSCORE_EMPHASIS = Pattern
		.compile("(?<![\\p{L}\\p{N}])_+|_+(?![\\p{L}\\p{N}])");

	/** Un signo de puntuación escapado con barra invertida: se conserva como texto, sin su significado Markdown. */
	private static final Pattern ESCAPE = Pattern.compile("\\\\([\\\\`*_{}\\[\\]()#+\\-.!>|~<])");

	/** Los escapes de los signos que se quitan después se protegen con estos caracteres de uso privado. */
	private static final String ESCAPABLE = "`*_~";

	private static final char PROTECTED_BASE = '\uE000';

	private static final Pattern WHITESPACE = Pattern.compile("[\\s\\p{Z}]+");

	private Excerpts() {
	}

	/**
	 * @return el extracto, o {@code ""} si el cuerpo no tiene texto (vacío, solo código, solo enlaces de referencia…)
	 */
	static String of(String body) {
		StringBuilder text = new StringBuilder();
		char fence = 0;
		int fenceLength = 0;
		for (String raw : body.split("\r\n|\r|\n", -1)) {
			String line = raw.stripLeading();
			boolean indented = raw.length() - line.length() <= 3;
			if (fence != 0) {
				if (indented && closesFence(line, fence, fenceLength)) {
					fence = 0;
				}
				continue;
			}
			if (indented && opensFence(line)) {
				fence = line.charAt(0);
				fenceLength = leadingRun(line, fence);
				continue;
			}
			String cleaned = clean(line.stripTrailing());
			if (cleaned.isEmpty()) {
				continue;
			}
			if (!text.isEmpty()) {
				text.append(' ');
			}
			text.append(cleaned);
			// Con el doble del texto que cabe en un extracto ya no hace falta leer el resto del cuerpo.
			if (text.length() > MAX_LENGTH * 2) {
				break;
			}
		}
		return truncate(WHITESPACE.matcher(plain(text.toString())).replaceAll(" ").strip());
	}

	/**
	 * Quita el HTML del texto ya unido, para que una etiqueta o un comentario repartidos en varias líneas no sobrevivan.
	 * Las entidades se decodifican antes, de modo que {@code &lt;b&gt;} también acaba como texto sin marcado.
	 */
	private static String plain(String joined) {
		String text = joined.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'");
		text = text.replace("&amp;", "&");
		text = TAG.matcher(stripComments(text)).replaceAll(" ");
		return STRAY_TAG_START.matcher(text).replaceAll("");
	}

	/** Quita {@code <!-- … -->}, también en varias líneas, con un recorrido lineal; una apertura sin cierre se deja. */
	private static String stripComments(String text) {
		StringBuilder kept = new StringBuilder(text.length());
		int from = 0;
		while (true) {
			int open = text.indexOf("<!--", from);
			int close = (open < 0) ? -1 : text.indexOf("-->", open + 4);
			if (close < 0) {
				return kept.append(text, from, text.length()).toString();
			}
			kept.append(text, from, open).append(' ');
			from = close + 3;
		}
	}

	private static boolean opensFence(String line) {
		return (line.startsWith("```") || line.startsWith("~~~")) && leadingRun(line, line.charAt(0)) >= 3
				&& (line.charAt(0) != '`' || line.indexOf('`', leadingRun(line, '`')) < 0);
	}

	private static boolean closesFence(String line, char fence, int fenceLength) {
		int run = leadingRun(line, fence);
		return run >= fenceLength && line.substring(run).isBlank();
	}

	private static int leadingRun(String line, char c) {
		int count = 0;
		while (count < line.length() && line.charAt(count) == c) {
			count++;
		}
		return count;
	}

	/** Limpia una línea ya sin sangría: bloques de una línea primero y sintaxis en línea después. */
	private static String clean(String line) {
		if (line.isEmpty() || isRule(line) || isTableSeparator(line) || SETEXT_UNDERLINE.matcher(line).matches()
				|| REFERENCE_DEFINITION.matcher(line).matches()) {
			return "";
		}
		String text = line;
		while (text.startsWith(">")) {
			text = text.substring(1).stripLeading();
		}
		int hashes = leadingRun(text, '#');
		if (hashes >= 1 && hashes <= 6 && (text.length() == hashes || Character.isWhitespace(text.charAt(hashes)))) {
			text = text.substring(hashes).strip().replaceAll("\\s+#+$", "");
		}
		text = LIST_MARKER.matcher(text).replaceFirst("");
		if (isRule(text)) {
			return "";
		}
		text = ESCAPE.matcher(text).replaceAll((match) -> {
			char escaped = match.group(1).charAt(0);
			int index = ESCAPABLE.indexOf(escaped);
			return Matcher.quoteReplacement(String.valueOf(index < 0 ? escaped : (char) (PROTECTED_BASE + index)));
		});
		text = text.replace('|', ' ');
		text = INLINE_LINK.matcher(text).replaceAll("$1");
		text = REFERENCE_LINK.matcher(text).replaceAll("$1");
		text = AUTOLINK.matcher(text).replaceAll("$1");
		// Las etiquetas de una sola línea se quitan ya aquí, para que no cuenten en el límite de lectura; las que ocupan
		// varias líneas se quitan después, sobre el texto unido.
		text = TAG.matcher(text).replaceAll(" ");
		text = text.replace("`", "");
		text = STAR_EMPHASIS.matcher(text).replaceAll("").replace("~~", "");
		text = UNDERSCORE_EMPHASIS.matcher(text).replaceAll("");
		return restoreEscaped(text).strip();
	}

	private static String restoreEscaped(String text) {
		StringBuilder restored = new StringBuilder(text.length());
		for (int i = 0; i < text.length(); i++) {
			char c = text.charAt(i);
			int index = c - PROTECTED_BASE;
			restored.append(index >= 0 && index < ESCAPABLE.length() ? ESCAPABLE.charAt(index) : c);
		}
		return restored.toString();
	}

	/** {@code ---}, {@code ***} o {@code ___} con tres o más marcas y, a lo sumo, espacios entre ellas. */
	private static boolean isRule(String line) {
		char mark = line.charAt(0);
		if (mark != '-' && mark != '*' && mark != '_') {
			return false;
		}
		int marks = 0;
		for (int i = 0; i < line.length(); i++) {
			char c = line.charAt(i);
			if (c == mark) {
				marks++;
			}
			else if (c != ' ' && c != '\t') {
				return false;
			}
		}
		return marks >= 3;
	}

	/** La fila de guiones que separa la cabecera de una tabla: {@code | --- | :-: |}. */
	private static boolean isTableSeparator(String line) {
		boolean dashes = false;
		for (int i = 0; i < line.length(); i++) {
			char c = line.charAt(i);
			if (c == '-') {
				dashes = true;
			}
			else if (c != '|' && c != ':' && c != ' ' && c != '\t') {
				return false;
			}
		}
		return dashes && line.indexOf('|') >= 0;
	}

	/**
	 * Corta en el último espacio que deja sitio, por puntos de código, de modo que ni una palabra ni un emoji queden
	 * partidos, y añade la elipsis dentro del límite. Una «palabra» sin espacios más larga que el límite se corta en
	 * seco.
	 */
	private static String truncate(String text) {
		if (text.codePointCount(0, text.length()) <= MAX_LENGTH) {
			return text;
		}
		int room = MAX_LENGTH - ELLIPSIS.length();
		int end = text.offsetByCodePoints(0, room);
		if (!Character.isWhitespace(text.charAt(end))) {
			int space = text.lastIndexOf(' ', end);
			if (space > 0) {
				end = space;
			}
		}
		String cut = text.substring(0, end).stripTrailing();
		while (!cut.isEmpty() && ",;:-–—(".indexOf(cut.charAt(cut.length() - 1)) >= 0) {
			cut = cut.substring(0, cut.length() - 1).stripTrailing();
		}
		return cut + ELLIPSIS;
	}

}
