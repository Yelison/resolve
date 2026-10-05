package com.resolve.api.customers;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import com.resolve.api.support.OpenApiContract;
import com.resolve.api.support.TestClockConfiguration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Archivado y restauración: solo administradores, sin tocar los tickets y con efecto en el acceso del cliente. */
class CustomerLifecycleApiTest extends CustomersFixture {

	@Test
	void archivingHidesTheCustomerFromListsAndSearchButKeepsItsTickets() throws Exception {
		JsonNode ticket = createTicketFor(this.mariaCustomer, "No puedo acceder");

		this.mvc.perform(post(API + "/customers/" + this.mariaCustomer + "/archive").with(as(ADMIN)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("archiveCustomer"))
			.andExpect(header().string("ETag", "\"1\""))
			.andExpect(jsonPath("$.archived").value(true))
			.andExpect(jsonPath("$.archivedAt").value(TestClockConfiguration.START.toString()))
			.andExpect(jsonPath("$.version").value(1))
			.andExpect(jsonPath("$.openTickets").value(1));

		assertThat(listAs(LAURA, "").path("items").findValuesAsString("name")).doesNotContain("María Pérez");
		assertThat(listAs(LAURA, "?q=maría").path("totalItems").asInt()).isZero();
		this.mvc.perform(get(API + "/customers").param("archived", "true").with(as(LAURA)))
			.andExpect(jsonPath("$.items[*].name", contains("María Pérez")));
		// Sus tickets siguen en la bandeja, se pueden leer y se pueden editar.
		this.mvc.perform(get(API + "/tickets").param("customerId", this.mariaCustomer.toString()).with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.totalItems").value(1))
			.andExpect(jsonPath("$.items[0].customer.name").value("María Pérez"));
		this.mvc.perform(get(API + "/tickets/" + ticket.path("number").asLong()).with(as(LAURA)))
			.andExpect(status().isOk());
		this.mvc.perform(patch(API + "/tickets/" + ticket.path("number").asLong()).with(as(LAURA))
			.header("If-Match", "\"0\"")
			.contentType("application/merge-patch+json")
			.content("{\"status\": \"in_progress\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("in_progress"));
	}

	@Test
	void archivingTwiceIsAConflict() throws Exception {
		assertThat(archive(ADMIN, this.carlosCustomer).getResponse().getStatus()).isEqualTo(200);
		this.mvc.perform(post(API + "/customers/" + this.carlosCustomer + "/archive").with(as(ADMIN)))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("archiveCustomer"))
			.andExpect(jsonPath("$.detail").value("El cliente ya está archivado."));
		this.mvc.perform(get(API + "/customers/" + this.carlosCustomer).with(as(ADMIN)))
			.andExpect(jsonPath("$.version").value(1));
	}

	@Test
	void anAgentCannotArchiveOrRestore() throws Exception {
		this.mvc.perform(post(API + "/customers/" + this.carlosCustomer + "/archive").with(as(LAURA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("archiveCustomer"));
		this.data.archiveCustomer(this.anaCustomer, TestClockConfiguration.START);
		this.mvc.perform(post(API + "/customers/" + this.anaCustomer + "/restore").with(as(LAURA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("restoreCustomer"));
		// El 403 llega antes que cualquier comprobación de datos: ni siquiera con un id inexistente.
		this.mvc.perform(post(API + "/customers/" + UUID.randomUUID() + "/archive").with(as(LAURA)))
			.andExpect(status().isForbidden());
		this.mvc.perform(get(API + "/customers/" + this.carlosCustomer).with(as(LAURA)))
			.andExpect(jsonPath("$.archived").value(false));
		this.mvc.perform(get(API + "/customers/" + this.anaCustomer).with(as(LAURA)))
			.andExpect(jsonPath("$.archived").value(true));
	}

	@Test
	void restoringBringsTheCustomerBack() throws Exception {
		assertThat(archive(ADMIN, this.carlosCustomer).getResponse().getStatus()).isEqualTo(200);
		this.mvc.perform(post(API + "/customers/" + this.carlosCustomer + "/restore").with(as(ADMIN)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("restoreCustomer"))
			.andExpect(header().string("ETag", "\"2\""))
			.andExpect(jsonPath("$.archived").value(false))
			.andExpect(jsonPath("$.archivedAt").isEmpty())
			.andExpect(jsonPath("$.version").value(2));
		assertThat(listAs(LAURA, "").path("items").findValuesAsString("name")).contains("Carlos Ruiz");
		// Restaurar uno activo no tiene sentido.
		this.mvc.perform(post(API + "/customers/" + this.carlosCustomer + "/restore").with(as(ADMIN)))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("restoreCustomer"))
			.andExpect(jsonPath("$.detail").value("El cliente no está archivado."));
		// Y vuelve a poder editarse.
		MvcResult edited = patchCustomer(ADMIN, this.carlosCustomer, "2", "{\"company\": \"De vuelta\"}");
		assertThat(edited.getResponse().getStatus()).isEqualTo(200);
	}

	@Test
	void aForeignCustomerCannotBeArchivedOrRestored() throws Exception {
		this.mvc.perform(post(API + "/customers/" + this.northwindCustomer + "/archive").with(as(ADMIN)))
			.andExpect(status().isNotFound())
			.andExpect(matchesContract("archiveCustomer"));
		this.mvc.perform(post(API + "/customers/" + this.northwindCustomer + "/restore").with(as(ADMIN)))
			.andExpect(status().isNotFound())
			.andExpect(matchesContract("restoreCustomer"));
		this.mvc.perform(get(API + "/customers/" + this.northwindCustomer).with(as(NORTHWIND_AGENT)))
			.andExpect(jsonPath("$.archived").value(false))
			.andExpect(jsonPath("$.version").value(0));
	}

	@Test
	void aMemberOfAnArchivedCustomerGets401() throws Exception {
		this.mvc.perform(get(API + "/tickets").with(as(MARIA))).andExpect(status().isOk());
		assertThat(archive(ADMIN, this.mariaCustomer).getResponse().getStatus()).isEqualTo(200);
		this.mvc.perform(get(API + "/tickets").with(as(MARIA)))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("listTickets"));
		this.mvc.perform(get(API + "/me").with(as(MARIA)))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("getMe"));
		// Al restaurar, el acceso se reanuda.
		assertThat(restore(ADMIN, this.mariaCustomer).getResponse().getStatus()).isEqualTo(200);
		this.mvc.perform(get(API + "/tickets").with(as(MARIA))).andExpect(status().isOk());
	}

	@Test
	void aTicketCannotBeCreatedForAnArchivedCustomer() throws Exception {
		this.data.archiveCustomer(this.carlosCustomer, TestClockConfiguration.START);
		MvcResult archived = createTicketResult(this.carlosCustomer);
		MvcResult unknown = createTicketResult(UUID.randomUUID());
		assertThat(archived.getResponse().getStatus()).isEqualTo(400);
		assertThat(body(archived).path("errors").get(0).path("field").asString()).isEqualTo("customerId");
		// El mensaje es el mismo que con un cliente que no existe: no se distingue «archivado» de «desconocido».
		assertThat(body(archived).path("errors")).isEqualTo(body(unknown).path("errors"));
	}

	private JsonNode createTicketFor(UUID customerId, String subject) throws Exception {
		MvcResult result = createTicketResult(customerId, subject);
		assertThat(result.getResponse().getStatus()).isEqualTo(201);
		return body(result);
	}

	private MvcResult createTicketResult(UUID customerId) throws Exception {
		return createTicketResult(customerId, "Ayuda");
	}

	private MvcResult createTicketResult(UUID customerId, String subject) throws Exception {
		return this.mvc
			.perform(post(API + "/tickets").with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON).content("""
					{"customerId": "%s", "subject": "%s", "description": "Detalle"}""".formatted(customerId, subject)))
			.andReturn();
	}

	@Test
	@Timeout(40)
	void simultaneousArchivesYieldOne200AndTheRestDeclared409s() throws Exception {
		List<Integer> statuses = runConcurrently(8, () -> {
			MvcResult result = archive(ADMIN, this.carlosCustomer);
			OpenApiContract.assertMatches("archiveCustomer", result);
			return result.getResponse().getStatus();
		});
		// Quien pierde la carrera lee la fila ya archivada: un 409 declarado, nunca un 412 que la acción no tiene.
		assertThat(statuses).containsOnly(200, 409);
		assertThat(statuses.stream().filter((status) -> status == 200).count()).isEqualTo(1);
		this.mvc.perform(get(API + "/customers/" + this.carlosCustomer).with(as(ADMIN)))
			.andExpect(jsonPath("$.version").value(1));
	}

	@Test
	@Timeout(40)
	void simultaneousRestoresYieldOne200AndTheRestDeclared409s() throws Exception {
		this.data.archiveCustomer(this.carlosCustomer, TestClockConfiguration.START);
		List<Integer> statuses = runConcurrently(8, () -> {
			MvcResult result = restore(ADMIN, this.carlosCustomer);
			OpenApiContract.assertMatches("restoreCustomer", result);
			return result.getResponse().getStatus();
		});
		assertThat(statuses).containsOnly(200, 409);
		assertThat(statuses.stream().filter((status) -> status == 200).count()).isEqualTo(1);
	}

	/** Lanza {@code attempts} llamadas a la vez (todas esperan la misma señal de salida) y devuelve sus estados. */
	private static List<Integer> runConcurrently(int attempts, Callable<Integer> call) throws Exception {
		ExecutorService executor = Executors.newFixedThreadPool(attempts);
		try {
			CountDownLatch start = new CountDownLatch(1);
			List<Future<Integer>> results = new ArrayList<>();
			for (int i = 0; i < attempts; i++) {
				results.add(executor.submit(() -> {
					start.await();
					return call.call();
				}));
			}
			start.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> result : results) {
				statuses.add(result.get(30, TimeUnit.SECONDS));
			}
			return statuses;
		}
		finally {
			executor.shutdownNow();
		}
	}

}
