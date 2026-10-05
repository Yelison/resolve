package com.resolve.api.knowledge;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Altas simultáneas con el mismo título. Una barrera aparca la primera entre elegir el slug y guardar, así la carrera
 * no depende de los tiempos: sin el bloqueo de las altas de la organización la segunda eligiría el mismo slug y la
 * restricción única la haría fallar.
 */
class ArticleSlugRaceTest extends KnowledgeFixture {

	@Autowired
	private ArticleSlugBarrier barrier;

	@Autowired
	private JdbcClient jdbc;

	private ExecutorService executor;

	@AfterEach
	void tearDown() {
		this.barrier.disarm();
		if (this.executor != null) {
			this.executor.shutdownNow();
		}
	}

	@Test
	@Timeout(90)
	void aSecondCreationWaitsForTheFirstAndTakesTheNextSuffix() throws Exception {
		this.executor = Executors.newFixedThreadPool(2);
		this.barrier.arm();
		Future<MvcResult> first = this.executor.submit(() -> postArticle(LAURA, article("Guía de envíos")));
		assertThat(this.barrier.awaitReached(20)).as("la primera alta llegó a elegir su slug").isTrue();

		Future<MvcResult> second = this.executor.submit(() -> postArticle(ADMIN, article("Guía de envíos")));
		awaitAWaiterForTheSlugLock();
		assertThat(second.isDone()).as("la segunda alta sigue esperando mientras la primera no guarda").isFalse();
		this.barrier.release();

		MvcResult firstResult = first.get(30, TimeUnit.SECONDS);
		MvcResult secondResult = second.get(30, TimeUnit.SECONDS);
		assertThat(firstResult.getResponse().getStatus()).isEqualTo(201);
		assertThat(secondResult.getResponse().getStatus()).isEqualTo(201);
		assertThat(body(firstResult).path("slug").asString()).isEqualTo("guia-de-envios");
		assertThat(body(secondResult).path("slug").asString()).isEqualTo("guia-de-envios-2");
	}

	@Test
	@Timeout(60)
	void aSlugTakenBehindTheLockIsAConflictNotAServerError() throws Exception {
		// Una vía que no pasara por el bloqueo (una importación, otro servicio) guarda el slug entre la elección y el alta.
		// Se inserta desde otro hilo: en el de la petición, JdbcClient reutilizaría su transacción y la fila se desharía con ella.
		this.barrier.runOnce(() -> CompletableFuture.runAsync(() -> this.data.article(this.acme, this.accountCategory,
				"guia-de-envios", "Guía de envíos", "Texto", "draft", "internal", this.lauraId,
				Instant.parse("2026-10-05T00:00:00Z"))).join());

		this.mvc.perform(post(API + "/knowledge/articles").with(as(LAURA))
			.contentType(MediaType.APPLICATION_JSON)
			.content(article("Guía de envíos")))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("createArticle"))
			.andExpect(jsonPath("$.detail").value("Otro artículo acaba de tomar ese título; vuelve a intentarlo."));

		// El alta fallida no deja nada a medias y reintentar toma el siguiente sufijo.
		assertThat(listArticles(LAURA, "?q=envíos").path("totalItems").asInt()).isEqualTo(1);
		assertThat(body(postArticle(LAURA, article("Guía de envíos"))).path("slug").asString())
			.isEqualTo("guia-de-envios-2");
	}

	@Test
	@Timeout(90)
	void theLockCoversEveryBaseOfTheOrganizationNotJustTheSameTitle() throws Exception {
		// «Factura» ya existe, así que otra «Factura» elige «factura-2»; «Factura 2» elegiría ese mismo slug como base.
		createArticle(LAURA, "Factura");
		this.executor = Executors.newFixedThreadPool(2);
		this.barrier.arm();
		Future<MvcResult> first = this.executor.submit(() -> postArticle(LAURA, article("Factura")));
		assertThat(this.barrier.awaitReached(20)).isTrue();

		Future<MvcResult> second = this.executor.submit(() -> postArticle(ADMIN, article("Factura 2")));
		awaitAWaiterForTheSlugLock();
		this.barrier.release();

		assertThat(body(first.get(30, TimeUnit.SECONDS)).path("slug").asString()).isEqualTo("factura-2");
		MvcResult secondResult = second.get(30, TimeUnit.SECONDS);
		assertThat(secondResult.getResponse().getStatus()).isEqualTo(201);
		assertThat(body(secondResult).path("slug").asString()).isEqualTo("factura-2-2");
	}

	@Test
	@Timeout(90)
	void manySimultaneousCreationsGetConsecutiveDistinctSlugs() throws Exception {
		int attempts = 8;
		this.executor = Executors.newFixedThreadPool(attempts);
		CountDownLatch start = new CountDownLatch(1);
		List<Future<MvcResult>> results = new ArrayList<>();
		for (int i = 0; i < attempts; i++) {
			results.add(this.executor.submit(() -> {
				start.await();
				return postArticle(LAURA, article("Preguntas frecuentes"));
			}));
		}
		start.countDown();

		List<String> slugs = new ArrayList<>();
		for (Future<MvcResult> result : results) {
			MvcResult response = result.get(30, TimeUnit.SECONDS);
			assertThat(response.getResponse().getStatus()).as(response.getResponse().getContentAsString()).isEqualTo(201);
			slugs.add(body(response).path("slug").asString());
		}
		assertThat(slugs).containsExactlyInAnyOrder("preguntas-frecuentes", "preguntas-frecuentes-2",
				"preguntas-frecuentes-3", "preguntas-frecuentes-4", "preguntas-frecuentes-5",
				"preguntas-frecuentes-6", "preguntas-frecuentes-7", "preguntas-frecuentes-8");
	}

	private String article(String title) {
		return articleJson(title, "Texto", this.accountCategory, "internal");
	}

	/** Espera, consultando los bloqueos de PostgreSQL, a que otra transacción esté bloqueada en un bloqueo consultivo. */
	private void awaitAWaiterForTheSlugLock() throws InterruptedException {
		for (int i = 0; i < 200; i++) {
			// Solo cuenta a quien espera la clave de las altas de esta organización: classid y objid son las dos mitades
			// de 32 bits de la clave de 64 bits que calcula hashtextextended.
			Long waiting = this.jdbc.sql("""
					SELECT count(*) FROM pg_locks
					WHERE locktype = 'advisory' AND NOT granted
					  AND ((classid::bigint << 32) | objid::bigint) = hashtextextended(?, 0)
					""")
				.param("article-slug:" + this.acme)
				.query(Long.class)
				.single();
			if (waiting > 0) {
				return;
			}
			Thread.sleep(50);
		}
		throw new AssertionError("La segunda alta no quedó esperando el bloqueo de slugs de la organización");
	}

}
