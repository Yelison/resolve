package com.resolve.api.knowledge;

import java.time.Duration;
import javax.sql.DataSource;

import com.resolve.api.support.RowLock;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MvcResult;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.assertj.core.api.Assertions.assertThat;

/** Otra transacción retiene la fila del artículo: editar y publicar responden 503 tras una espera acotada. */
class ArticleLockTimeoutTest extends KnowledgeFixture {

	private static final Duration LIMIT = Duration.ofSeconds(20);

	@Autowired
	private DataSource dataSource;

	@Test
	void editPublishAndUnpublishAnswer503WhileTheRowIsHeld() throws Exception {
		try (RowLock lock = RowLock.hold(this.dataSource,
				"select id from articles where organization_id = ? and slug = ? for no key update", this.acme,
				RECOVER)) {
			MvcResult edit = assertTimeoutPreemptively(LIMIT,
					() -> patchArticle(LAURA, RECOVER, "0", "{\"title\": \"Nuevo título\"}"));
			assertThat(edit.getResponse().getStatus()).isEqualTo(503);
			assertThat(edit.getResponse().getHeader("Retry-After")).isEqualTo("1");
			matchesContract("updateArticle").match(edit);
			MvcResult publish = assertTimeoutPreemptively(LIMIT, () -> publish(LAURA, RECOVER));
			assertThat(publish.getResponse().getStatus()).isEqualTo(503);
			matchesContract("publishArticle").match(publish);
			MvcResult unpublish = assertTimeoutPreemptively(LIMIT, () -> unpublish(LAURA, RECOVER));
			assertThat(unpublish.getResponse().getStatus()).isEqualTo(503);
			assertThat(unpublish.getResponse().getHeader("Retry-After")).isEqualTo("1");
			matchesContract("unpublishArticle").match(unpublish);
		}

		assertThat(patchArticle(LAURA, RECOVER, "0", "{\"title\": \"Nuevo título\"}").getResponse().getStatus())
			.isEqualTo(200);
	}

	@Test
	void creatingWhileTheSlugLockIsHeldAnswers503AndTheRetryWorks() throws Exception {
		String article = articleJson("Nuevo artículo", "Texto", this.accountCategory, "internal");
		try (RowLock lock = RowLock.hold(this.dataSource,
				"select 1 from (select pg_advisory_xact_lock(hashtextextended(?, 0))) as locked",
				"article-slug:" + this.acme)) {
			MvcResult blocked = assertTimeoutPreemptively(LIMIT, () -> postArticle(LAURA, article));
			assertThat(blocked.getResponse().getStatus()).isEqualTo(503);
			assertThat(blocked.getResponse().getHeader("Retry-After")).isEqualTo("1");
			matchesContract("createArticle").match(blocked);
		}

		assertThat(postArticle(LAURA, article).getResponse().getStatus()).isEqualTo(201);
	}

}
