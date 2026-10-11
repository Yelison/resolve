package com.resolve.api.tickets;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MessageExcerptTest {

	@Test
	void keepsPlainTextAsIs() {
		assertThat(MessageExcerpt.of("Hola, María. ¿Me confirmas cuál usas ahora?"))
			.isEqualTo("Hola, María. ¿Me confirmas cuál usas ahora?");
	}

	@Test
	void stripsTheMarkdownTheEditorWrites() {
		assertThat(MessageExcerpt.of("**Hola** _María_, mira [esta guía](https://ayuda.example/a_b) ya"))
			.isEqualTo("Hola María, mira esta guía ya");
		assertThat(MessageExcerpt.of("Pasos:\n- uno\n- dos\n\n1. tres")).isEqualTo("Pasos: uno dos tres");
		assertThat(MessageExcerpt.of("## Título\n> cita con `código`")).isEqualTo("Título cita con código");
	}

	@Test
	void leavesUnderscoresInsideWordsAlone() {
		assertThat(MessageExcerpt.of("Usa ticket_id y user_name tal cual")).isEqualTo("Usa ticket_id y user_name tal cual");
		// Un guion bajo pegado a una palabra no abre una cursiva aunque otro lo cierre más adelante.
		assertThat(MessageExcerpt.of("Usa foo_bar_ y 2 * 3 * 4")).isEqualTo("Usa foo_bar_ y 2 * 3 * 4");
	}

	@Test
	void collapsesWhitespaceIntoOneLine() {
		assertThat(MessageExcerpt.of("  línea uno\n\n\tlínea   dos  ")).isEqualTo("línea uno línea dos");
	}

	@Test
	void anEmptyOrMarkupOnlyBodyYieldsAnEmptyExcerpt() {
		assertThat(MessageExcerpt.of("   ")).isEmpty();
		assertThat(MessageExcerpt.of("```\n```")).isEmpty();
	}

	@Test
	void cutsAtOneHundredFortyCodePointsWithAnEllipsisWithoutSplittingAnEmoji() {
		String exact = "a".repeat(140);
		assertThat(MessageExcerpt.of(exact)).isEqualTo(exact);

		String longText = "😀".repeat(141);
		String cut = MessageExcerpt.of(longText);
		assertThat(cut.codePointCount(0, cut.length())).isEqualTo(140);
		assertThat(cut).isEqualTo("😀".repeat(139) + "…");
		assertThat(Character.isLowSurrogate(cut.charAt(cut.length() - 2))).isTrue();
	}

}
