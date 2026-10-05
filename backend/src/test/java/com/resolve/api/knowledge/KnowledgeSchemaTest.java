package com.resolve.api.knowledge;

import java.time.Instant;
import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Las restricciones de V7 que protegen el aislamiento entre organizaciones y los valores permitidos. */
class KnowledgeSchemaTest extends ApiIntegrationTest {

	private static final Instant AT = Instant.parse("2026-10-01T12:00:00Z");

	@Autowired
	private JdbcClient jdbc;

	@Test
	void twoOrganizationsCanShareACategorySlugAndAnArticleSlug() {
		UUID acme = this.data.organization("Acme Studio");
		UUID northwind = this.data.organization("Northwind Soporte");
		UUID acmeAuthor = this.data.staff(acme, "agent", "Laura Méndez", "laura@acme.example");
		UUID northwindAuthor = this.data.staff(northwind, "agent", "Jordi Puig", "jordi@northwind.example");
		UUID acmeCategory = this.data.category(acme, "Cuenta", "cuenta");
		UUID northwindCategory = this.data.category(northwind, "Cuenta", "cuenta");

		this.data.article(acme, acmeCategory, "acceso", "Acceso", "Texto", "draft", "internal", acmeAuthor, AT);
		this.data.article(northwind, northwindCategory, "acceso", "Acceso", "Texto", "draft", "internal",
				northwindAuthor, AT);

		assertThat(this.jdbc.sql("SELECT count(*) FROM articles WHERE slug = 'acceso'").query(Long.class).single())
			.isEqualTo(2);
	}

	@Test
	void anOrganizationCannotRepeatASlug() {
		UUID acme = this.data.organization("Acme Studio");
		UUID author = this.data.staff(acme, "agent", "Laura Méndez", "laura@acme.example");
		UUID category = this.data.category(acme, "Cuenta", "cuenta");
		this.data.article(acme, category, "acceso", "Acceso", "Texto", "draft", "internal", author, AT);

		assertThatThrownBy(() -> this.data.category(acme, "Otra", "cuenta"))
			.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(
				() -> this.data.article(acme, category, "acceso", "Otro", "Texto", "draft", "internal", author, AT))
			.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void anArticleCannotPointAtACategoryOfAnotherOrganization() {
		UUID acme = this.data.organization("Acme Studio");
		UUID northwind = this.data.organization("Northwind Soporte");
		UUID author = this.data.staff(acme, "agent", "Laura Méndez", "laura@acme.example");
		UUID foreignCategory = this.data.category(northwind, "Cuenta", "cuenta");

		assertThatThrownBy(
				() -> this.data.article(acme, foreignCategory, "acceso", "Acceso", "Texto", "draft", "internal", author, AT))
			.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void onlyKnownStatusesAndVisibilitiesAreStored() {
		UUID acme = this.data.organization("Acme Studio");
		UUID author = this.data.staff(acme, "agent", "Laura Méndez", "laura@acme.example");
		UUID category = this.data.category(acme, "Cuenta", "cuenta");

		assertThatThrownBy(
				() -> this.data.article(acme, category, "a", "A", "Texto", "archived", "internal", author, AT))
			.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(
				() -> this.data.article(acme, category, "b", "B", "Texto", "draft", "private", author, AT))
			.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void anArticleStartsAtVersionZeroAndAllowsFeedback() {
		UUID acme = this.data.organization("Acme Studio");
		UUID author = this.data.staff(acme, "agent", "Laura Méndez", "laura@acme.example");
		UUID category = this.data.category(acme, "Cuenta", "cuenta");
		UUID id = this.data.article(acme, category, "acceso", "Acceso", "Texto", "draft", "internal", author, AT);

		assertThat(this.jdbc.sql("SELECT version FROM articles WHERE id = ?").param(id).query(Long.class).single())
			.isZero();
		assertThat(this.jdbc.sql("SELECT allow_feedback FROM articles WHERE id = ?")
			.param(id)
			.query(Boolean.class)
			.single()).isTrue();
	}

}
