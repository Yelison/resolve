package com.resolve.api.common.web;

import java.time.Duration;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * El modo mantenimiento de la demostración: la marca de {@code resolve_ops.maintenance} (que {@code flyway clean} no
 * toca) cierra la API con un 503 y la readiness, deja la liveness y caduca sola. El refresco programado no se espera:
 * el test lo llama.
 */
@TestPropertySource(properties = { "resolve.demo.enabled=true", "resolve.demo.maintenance-poll=PT1H",
		"management.endpoint.health.probes.enabled=true" })
class MaintenanceModeTest extends ApiIntegrationTest {

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private MaintenanceMode mode;

	@BeforeEach
	void createTheMarkTable() {
		this.jdbc.sql("CREATE SCHEMA IF NOT EXISTS resolve_ops").update();
		this.jdbc.sql("CREATE TABLE IF NOT EXISTS resolve_ops.maintenance (until timestamptz NOT NULL)").update();
		this.jdbc.sql("DELETE FROM resolve_ops.maintenance").update();
		this.data.staff(this.data.organization("Acme"), "admin", "Ana", "ana@acme.example");
		this.mode.refresh();
	}

	private void markFor(String interval) {
		this.jdbc.sql("DELETE FROM resolve_ops.maintenance").update();
		this.jdbc.sql("INSERT INTO resolve_ops.maintenance (until) VALUES (now() + CAST(? AS interval))")
			.param(interval)
			.update();
		this.mode.refresh();
	}

	@Test
	void withoutAMarkEverythingWorksAndReadinessIsUp() throws Exception {
		this.mvc.perform(get(API + "/me").with(as("ana@acme.example"))).andExpect(status().isOk());
		this.mvc.perform(get(API + "/actuator/health/readiness"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("UP"));
	}

	@Test
	void aMarkAnswers503ProblemWithRetryAfterOnReadsAndWritesAlike() throws Exception {
		markFor("60 seconds");

		this.mvc.perform(get(API + "/me").with(as("ana@acme.example")))
			.andExpect(status().isServiceUnavailable())
			.andExpect(header().string("Content-Type", containsString("application/problem+json")))
			.andExpect(header().string("Retry-After", "60"))
			.andExpect(jsonPath("$.title").value("Reinicio de la demostración en curso"))
			.andExpect(jsonPath("$.status").value(503))
			.andExpect(jsonPath("$.instance").value(API + "/me"));
		// Sin sesión ni cabecera también: el filtro va antes de la seguridad.
		this.mvc.perform(post(API + "/tickets").content("{}").contentType("application/json"))
			.andExpect(status().isServiceUnavailable());
	}

	@Test
	void readinessIsOutOfServiceButLivenessStaysUp() throws Exception {
		markFor("60 seconds");

		this.mvc.perform(get(API + "/actuator/health/readiness"))
			.andExpect(status().isServiceUnavailable())
			.andExpect(jsonPath("$.status").value("OUT_OF_SERVICE"));
		this.mvc.perform(get(API + "/actuator/health/liveness"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("UP"));
	}

	@Test
	void theModeEndsByItselfWhenTheMarkExpiresEvenIfNobodyRefreshes() throws Exception {
		markFor("60 seconds");
		this.mvc.perform(get(API + "/me").with(as("ana@acme.example"))).andExpect(status().isServiceUnavailable());

		this.clock.advance(Duration.ofSeconds(61));

		assertThat(this.mode.active()).isFalse();
		this.mvc.perform(get(API + "/me").with(as("ana@acme.example"))).andExpect(status().isOk());
	}

	@Test
	void removingTheMarkOpensTheApiAgainAtTheNextRefresh() throws Exception {
		markFor("60 seconds");
		this.jdbc.sql("DELETE FROM resolve_ops.maintenance").update();
		this.mode.refresh();

		this.mvc.perform(get(API + "/me").with(as("ana@acme.example"))).andExpect(status().isOk());
		this.mvc.perform(get(API + "/actuator/health/readiness")).andExpect(status().isOk());
	}

	@Test
	void aMarkFarInTheFutureIsIgnoredSoItCannotKeepTheDemoClosedForever() throws Exception {
		markFor("2 hours");

		assertThat(this.mode.active()).isFalse();
		this.mvc.perform(get(API + "/me").with(as("ana@acme.example"))).andExpect(status().isOk());
	}

	@Test
	void aMissingTableMeansNoMaintenance() throws Exception {
		this.jdbc.sql("DROP SCHEMA resolve_ops CASCADE").update();
		this.mode.refresh();

		this.mvc.perform(get(API + "/me").with(as("ana@acme.example"))).andExpect(status().isOk());
	}

}
