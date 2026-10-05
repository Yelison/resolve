package com.resolve.api.knowledge;

import java.util.Set;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SlugsTest {

	@Test
	void stripsDiacriticsAndLowercases() {
		assertThat(Slugs.from("Cómo recuperar el acceso a tu cuenta")).isEqualTo("como-recuperar-el-acceso-a-tu-cuenta");
		assertThat(Slugs.from("Ñandú ÁÉÍÓÚ ü")).isEqualTo("nandu-aeiou-u");
	}

	@Test
	void collapsesRunsOfSymbolsAndTrimsTheHyphensAtBothEnds() {
		assertThat(Slugs.from("  ¿Qué es Resolve?!  ")).isEqualTo("que-es-resolve");
		assertThat(Slugs.from("a -- b__c")).isEqualTo("a-b-c");
	}

	@Test
	void truncatesWithoutLeavingAHyphenAtTheEnd() {
		String title = "a".repeat(99) + " b";

		assertThat(Slugs.from(title)).isEqualTo("a".repeat(99));
		assertThat(Slugs.from("a".repeat(150))).hasSize(Slugs.ARTICLE_MAX_LENGTH);
	}

	@Test
	void usesAFallbackWhenNothingSurvivesTheNormalization() {
		assertThat(Slugs.from("¿?")).isEqualTo("articulo");
		assertThat(Slugs.from("日本語")).isEqualTo("articulo");
		assertThat(Slugs.from("😀")).isEqualTo("articulo");
		assertThat(Slugs.from("¿?", Slugs.CATEGORY_MAX_LENGTH, "categoria")).isEqualTo("categoria");
	}

	@Test
	void theLimitOfACategoryFitsItsColumn() {
		assertThat(Slugs.from("b".repeat(200), Slugs.CATEGORY_MAX_LENGTH, "categoria")).hasSize(80);
	}

	@Test
	void keepsTheBaseWhenItIsFree() {
		assertThat(Slugs.firstFree("factura", Set.of("otra"))).isEqualTo("factura");
	}

	@Test
	void addsTheFirstFreeSuffixStartingAtTwo() {
		assertThat(Slugs.firstFree("factura", Set.of("factura"))).isEqualTo("factura-2");
		assertThat(Slugs.firstFree("factura", Set.of("factura", "factura-2", "factura-4"))).isEqualTo("factura-3");
	}

	@Test
	void aTitleThatLooksLikeASuffixedSlugIsNotConfusedWithOne() {
		// «Factura 2» ya ocupa «factura-2»: la segunda «Factura» salta a «factura-3».
		assertThat(Slugs.firstFree("factura", Set.of("factura", "factura-2"))).isEqualTo("factura-3");
	}

}
