package com.resolve.api.organizations;

import java.time.Duration;
import java.util.UUID;
import javax.sql.DataSource;

import com.resolve.api.support.ApiIntegrationTest;
import com.resolve.api.support.RowLock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Otra transacción retiene la fila de la organización: editar los ajustes responde 503 tras una espera acotada. */
class OrganizationLockTimeoutTest extends ApiIntegrationTest {

	private static final String ADMIN = "admin@acme.example";

	private static final MediaType MERGE_PATCH = MediaType.parseMediaType("application/merge-patch+json");

	/** Mucho más que el tope del bloqueo: si el PATCH vuelve a esperar sin límite, el test falla en vez de colgarse. */
	private static final Duration LIMIT = Duration.ofSeconds(20);

	@Autowired
	private DataSource dataSource;

	private UUID acme;

	@BeforeEach
	void seed() {
		this.acme = this.data.organization("Acme Studio");
		this.data.staff(this.acme, "admin", "Yelisson Ortiz", ADMIN);
	}

	@Test
	void aRowHeldByAnotherTransactionIsAnExplicit503AndTheRetryWorks() throws Exception {
		try (RowLock lock = RowLock.hold(this.dataSource, "select id from organizations where id = ? for no key update",
				this.acme)) {
			ResultActions blocked = assertTimeoutPreemptively(LIMIT,
					() -> this.mvc.perform(patch(API + "/organization").with(as(ADMIN))
						.contentType(MERGE_PATCH)
						.header("If-Match", "\"0\"")
						.content("{\"name\": \"Otro nombre\"}")));
			blocked.andExpect(status().isServiceUnavailable())
				.andExpect(matchesContract("updateOrganization"))
				.andExpect(header().string("Retry-After", "1"))
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.title").value("Recurso ocupado"));
		}

		// Nada cambió: la versión sigue siendo la 0 y la misma petición, con la fila libre, se aplica.
		this.mvc.perform(get(API + "/organization").with(as(ADMIN)))
			.andExpect(header().string("ETag", "\"0\""))
			.andExpect(jsonPath("$.name").value("Acme Studio"));
		this.mvc.perform(patch(API + "/organization").with(as(ADMIN))
			.contentType(MERGE_PATCH)
			.header("If-Match", "\"0\"")
			.content("{\"name\": \"Otro nombre\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name").value("Otro nombre"));
	}

}
