package com.resolve.api.knowledge;

import java.time.Instant;
import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/** Comprueba que V7 y las entidades coinciden: Hibernate valida el esquema y los campos se leen de la fila. */
class KnowledgePersistenceTest extends ApiIntegrationTest {

	private static final Instant AT = Instant.parse("2026-10-01T12:00:00Z");

	@Autowired
	private ArticleRepository articles;

	@Autowired
	private CategoryRepository categories;

	@Autowired
	private TransactionTemplate transaction;

	@Test
	void readsAnArticleWithItsCategoryStatusVisibilityAndAuthor() {
		UUID organization = this.data.organization("Acme Studio");
		UUID author = this.data.staff(organization, "agent", "Laura Méndez", "laura@acme.example");
		UUID category = this.data.category(organization, "Cuenta y acceso", "cuenta-y-acceso");
		UUID id = this.data.article(organization, category, "recuperar-el-acceso", "Recuperar el acceso", "# Texto",
				"published", "public", author, AT);

		this.transaction.executeWithoutResult((status) -> {
			Article article = this.articles.findByOrganizationIdAndId(organization, id).orElseThrow();
			assertThat(article.getSlug()).isEqualTo("recuperar-el-acceso");
			assertThat(article.getTitle()).isEqualTo("Recuperar el acceso");
			assertThat(article.getBody()).isEqualTo("# Texto");
			assertThat(article.getStatus()).isEqualTo(ArticleStatus.PUBLISHED);
			assertThat(article.getVisibility()).isEqualTo(ArticleVisibility.PUBLIC);
			assertThat(article.isAllowFeedback()).isTrue();
			assertThat(article.getVersion()).isZero();
			assertThat(article.getPublishedAt()).isEqualTo(AT);
			assertThat(article.getCategory().getName()).isEqualTo("Cuenta y acceso");
			assertThat(article.getCreatedBy().getName()).isEqualTo("Laura Méndez");
			assertThat(article.getUpdatedBy().getId()).isEqualTo(author);
		});
	}

	@Test
	void aDraftHasNoPublicationDate() {
		UUID organization = this.data.organization("Acme Studio");
		UUID author = this.data.staff(organization, "agent", "Laura Méndez", "laura@acme.example");
		UUID category = this.data.category(organization, "Cuenta", "cuenta");
		UUID id = this.data.article(organization, category, "borrador", "Borrador", "Texto", "draft", "internal", author,
				AT);

		this.transaction.executeWithoutResult((status) -> {
			Article article = this.articles.findByOrganizationIdAndId(organization, id).orElseThrow();
			assertThat(article.getStatus()).isEqualTo(ArticleStatus.DRAFT);
			assertThat(article.getVisibility()).isEqualTo(ArticleVisibility.INTERNAL);
			assertThat(article.getPublishedAt()).isNull();
		});
	}

	@Test
	void anArticleOfAnotherOrganizationIsNotFound() {
		UUID acme = this.data.organization("Acme Studio");
		UUID northwind = this.data.organization("Northwind Soporte");
		UUID author = this.data.staff(acme, "agent", "Laura Méndez", "laura@acme.example");
		UUID category = this.data.category(acme, "Cuenta", "cuenta");
		UUID id = this.data.article(acme, category, "acceso", "Acceso", "Texto", "draft", "internal", author, AT);

		assertThat(this.articles.findByOrganizationIdAndId(northwind, id)).isEmpty();
		assertThat(this.categories.findByOrganizationIdAndId(northwind, category)).isEmpty();
		assertThat(this.categories.findByOrganizationIdAndId(acme, category)).isPresent();
	}

}
