package com.resolve.api.knowledge;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ExcerptsTest {

	@Test
	void anEmptyOrBlankBodyHasNoExcerpt() {
		assertThat(Excerpts.of("")).isEmpty();
		assertThat(Excerpts.of("  \n\n\t \n")).isEmpty();
	}

	@Test
	void plainTextIsKeptAndItsLinesAreJoinedWithASpace() {
		assertThat(Excerpts.of("Primera línea.\nSegunda línea.\r\n\r\nTercera.")).isEqualTo(
				"Primera línea. Segunda línea. Tercera.");
	}

	@Test
	void headingsLoseTheirMarks() {
		assertThat(Excerpts.of("# Título\n\n## Sección ##\n\nTexto")).isEqualTo("Título Sección Texto");
		assertThat(Excerpts.of("#sin-espacio no es un encabezado")).isEqualTo("#sin-espacio no es un encabezado");
	}

	@Test
	void linksAndImagesKeepOnlyTheirText() {
		assertThat(Excerpts.of("Entra en [tu cuenta](https://example.com/a?b=1) y mira ![captura](x.png) o [ayuda][1]."))
			.isEqualTo("Entra en tu cuenta y mira captura o ayuda.");
		assertThat(Excerpts.of("[1]: https://example.com\n\nSolo una definición")).isEqualTo("Solo una definición");
	}

	@Test
	void inlineCodeKeepsItsContentButFencedCodeIsDropped() {
		assertThat(Excerpts.of("Ejecuta `npm test` ahora.")).isEqualTo("Ejecuta npm test ahora.");
		assertThat(Excerpts.of("Antes\n\n```js\nconst x = 1\n# no es un encabezado\n```\n\nDespués"))
			.isEqualTo("Antes Después");
		assertThat(Excerpts.of("~~~\ncódigo\n~~~\nTexto")).isEqualTo("Texto");
	}

	@Test
	void anUnclosedFenceDropsTheRestOfTheBody() {
		assertThat(Excerpts.of("Texto\n```\ncódigo sin cerrar\nmás código")).isEqualTo("Texto");
		assertThat(Excerpts.of("```\nsolo código\n```")).isEmpty();
	}

	@Test
	void aShorterRunDoesNotCloseALongerFence() {
		assertThat(Excerpts.of("````\n```\nsigue siendo código\n````\nFin")).isEqualTo("Fin");
	}

	@Test
	void listsQuotesTablesAndRulesLoseTheirSyntax() {
		assertThat(Excerpts.of("- uno\n* dos\n+ tres\n1. cuatro\n2) cinco\n- [x] hecho")).isEqualTo(
				"uno dos tres cuatro cinco hecho");
		assertThat(Excerpts.of("> Cita\n> > anidada")).isEqualTo("Cita anidada");
		assertThat(Excerpts.of("| A | B |\n| --- | :-: |\n| 1 | 2 |")).isEqualTo("A B 1 2");
		assertThat(Excerpts.of("Antes\n\n---\n\n***\n\n___\n\nDespués")).isEqualTo("Antes Después");
	}

	@Test
	void emphasisIsRemovedButSnakeCaseIsKept() {
		assertThat(Excerpts.of("Esto es **importante**, *muy* _claro_ y ~~viejo~~, ver snake_case_name."))
			.isEqualTo("Esto es importante, muy claro y viejo, ver snake_case_name.");
		assertThat(Excerpts.of("Escapado: \\*no\\* \\# tampoco")).isEqualTo("Escapado: *no* # tampoco");
	}

	@Test
	void htmlIsStrippedSoTheResultIsNeverMarkup() {
		String excerpt = Excerpts.of("Hola <b>mundo</b> <script>alert(1)</script> <img src=x onerror=alert(1)> <!-- nota -->fin");

		assertThat(excerpt).doesNotContain("<").doesNotContain(">");
		assertThat(excerpt).isEqualTo("Hola mundo alert(1) fin");
		assertThat(Excerpts.of("Si a < b y b > c")).isEqualTo("Si a < b y b > c");
	}

	@Test
	void htmlSpreadOverSeveralLinesIsStrippedToo() {
		for (String body : new String[] { "Hola <img src=x\nonerror=alert(1)> fin", "<a\nhref=\"javascript:alert(1)\">clic</a> texto",
				"Antes <!-- nota\nmultilínea --> después" }) {
			assertThat(Excerpts.of(body)).as(body).doesNotContain("<").doesNotContain(">");
		}
		assertThat(Excerpts.of("Hola <img src=x\nonerror=alert(1)> fin")).isEqualTo("Hola fin");
		assertThat(Excerpts.of("<a\nhref=\"javascript:alert(1)\">clic</a> texto")).isEqualTo("clic texto");
		assertThat(Excerpts.of("Antes <!-- nota\nmultilínea --> después")).isEqualTo("Antes después");
	}

	@Test
	void anUnclosedTagOrCommentLeavesNoMarkupBehind() {
		assertThat(Excerpts.of("Texto <img src=x onerror=alert(1)")).doesNotContainPattern("<[A-Za-z/]");
		assertThat(Excerpts.of("Texto </div y <b")).doesNotContainPattern("<[A-Za-z/]");
		assertThat(Excerpts.of("Texto <!-- sin cerrar")).startsWith("Texto");
	}

	@Test
	void aLessThanSignGluedToATextIsKeptNotDeleted() {
		assertThat(Excerpts.of("Si a<b entonces")).isEqualTo("Si a< b entonces");
		assertThat(Excerpts.of("te quiero </3")).isEqualTo("te quiero < /3");
		assertThat(Excerpts.of("Si a<b entonces")).doesNotContainPattern("<[A-Za-z/]");
	}

	@Test
	void entitiesAreDecodedWithoutReintroducingMarkup() {
		assertThat(Excerpts.of("Tom &amp; Jerry &quot;juntos&quot; &#39;hoy&#39;")).isEqualTo("Tom & Jerry \"juntos\" 'hoy'");
		assertThat(Excerpts.of("&lt;script&gt;alert(1)&lt;/script&gt; fin")).doesNotContain("<").doesNotContain(">");
		assertThat(Excerpts.of("&amp;lt;b&amp;gt;")).isEqualTo("&lt;b&gt;");
	}

	@Test
	void autolinksKeepTheirTextInsteadOfBeingTreatedAsTags() {
		assertThat(Excerpts.of("Visita <https://resolve.app> o escribe a <ayuda@resolve.app> para más."))
			.isEqualTo("Visita https://resolve.app o escribe a ayuda@resolve.app para más.");
		assertThat(Excerpts.of("Mira <mailto:ayuda@resolve.app>.")).isEqualTo("Mira mailto:ayuda@resolve.app.");
	}

	@Test
	void setextUnderlinesAreDropped() {
		assertThat(Excerpts.of("Título\n======\nCuerpo")).isEqualTo("Título Cuerpo");
	}

	@Test
	void aLoneAsteriskIsKeptButEmphasisIsStripped() {
		assertThat(Excerpts.of("2 * 3 = 6")).isEqualTo("2 * 3 = 6");
		assertThat(Excerpts.of("**negrita** y *cursiva*")).isEqualTo("negrita y cursiva");
	}

	@Test
	void aShortBodyIsNotCutAndOneOfExactlyTheLimitIsNotEllipsized() {
		String exact = "a".repeat(Excerpts.MAX_LENGTH);

		assertThat(Excerpts.of(exact)).isEqualTo(exact);
		assertThat(Excerpts.of("palabra ".repeat(20).strip()).length()).isLessThanOrEqualTo(Excerpts.MAX_LENGTH);
	}

	@Test
	void aLongBodyIsCutAtAWordBoundaryWithinTheLimitCountingTheEllipsis() {
		// El período de «palabras » (9) hace que el índice 159 caiga a mitad de palabra: hay que retroceder al espacio.
		String excerpt = Excerpts.of("palabras ".repeat(500));

		assertThat(excerpt).endsWith("palabras…").hasSizeLessThanOrEqualTo(Excerpts.MAX_LENGTH);
		assertThat(excerpt.substring(0, excerpt.length() - 1).split(" ")).allMatch("palabras"::equals);
		assertThat(excerpt.length()).isLessThan(Excerpts.MAX_LENGTH - 1);
	}

	@Test
	void aBodyAtTheMaximumLengthIsHandledAndCutAtTheLimit() {
		String body = ("Texto de relleno con **énfasis** y [enlaces](https://example.com/" + "x".repeat(40) + ") ").repeat(300);

		String excerpt = Excerpts.of(body.substring(0, 20_000));

		assertThat(excerpt).hasSizeLessThanOrEqualTo(Excerpts.MAX_LENGTH).endsWith("…");
		assertThat(excerpt).doesNotContain("*").doesNotContain("](").doesNotContain("https");
	}

	@Test
	void aSingleWordLongerThanTheLimitIsCutHard() {
		String excerpt = Excerpts.of("x".repeat(500));

		assertThat(excerpt).isEqualTo("x".repeat(Excerpts.MAX_LENGTH - 1) + "…");
	}

	@Test
	void theCutNeverSplitsASurrogatePair() {
		// 158 letras y un emoji (dos unidades de código, un punto de código) justo en el borde del límite.
		String body = "a".repeat(158) + "😀" + "😀 resto";

		String excerpt = Excerpts.of(body);

		assertThat(excerpt.codePointCount(0, excerpt.length())).isLessThanOrEqualTo(Excerpts.MAX_LENGTH);
		assertThat(excerpt).doesNotContainPattern("[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])");
		assertThat(excerpt).doesNotContainPattern("(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]");
	}

	@Test
	void trailingPunctuationIsNotLeftBeforeTheEllipsis() {
		String body = "a".repeat(150) + ", " + "b".repeat(30);

		assertThat(Excerpts.of(body)).isEqualTo("a".repeat(150) + "…");
	}

	@Test
	void pathologicalInputRunsInLinearTime() {
		String body = "[a](".repeat(5_000) + "\n" + "<!--".repeat(2_000);

		long start = System.nanoTime();
		Excerpts.of(body);

		assertThat((System.nanoTime() - start) / 1_000_000).isLessThan(500);
	}

}
