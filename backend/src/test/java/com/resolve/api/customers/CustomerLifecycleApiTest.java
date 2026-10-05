package com.resolve.api.customers;

import java.util.UUID;

import com.resolve.api.support.TestClockConfiguration;
import org.junit.jupiter.api.Test;
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

		this.mvc.perform(post("/customers/" + this.mariaCustomer + "/archive").with(as(ADMIN)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("archiveCustomer"))
			.andExpect(header().string("ETag", "\"1\""))
			.andExpect(jsonPath("$.archived").value(true))
			.andExpect(jsonPath("$.archivedAt").value(TestClockConfiguration.START.toString()))
			.andExpect(jsonPath("$.version").value(1))
			.andExpect(jsonPath("$.openTickets").value(1));

		assertThat(listAs(LAURA, "").path("items").findValuesAsString("name")).doesNotContain("María Pérez");
		assertThat(listAs(LAURA, "?q=maría").path("totalItems").asInt()).isZero();
		this.mvc.perform(get("/customers").param("archived", "true").with(as(LAURA)))
			.andExpect(jsonPath("$.items[*].name", contains("María Pérez")));
		// Sus tickets siguen en la bandeja, se pueden leer y se pueden editar.
		this.mvc.perform(get("/tickets").param("customerId", this.mariaCustomer.toString()).with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.totalItems").value(1))
			.andExpect(jsonPath("$.items[0].customer.name").value("María Pérez"));
		this.mvc.perform(get("/tickets/" + ticket.path("number").asLong()).with(as(LAURA)))
			.andExpect(status().isOk());
		this.mvc.perform(patch("/tickets/" + ticket.path("number").asLong()).with(as(LAURA))
			.header("If-Match", "\"0\"")
			.contentType("application/merge-patch+json")
			.content("{\"status\": \"in_progress\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("in_progress"));
	}

	@Test
	void archivingTwiceIsAConflict() throws Exception {
		assertThat(archive(ADMIN, this.carlosCustomer).getResponse().getStatus()).isEqualTo(200);
		this.mvc.perform(post("/customers/" + this.carlosCustomer + "/archive").with(as(ADMIN)))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("archiveCustomer"))
			.andExpect(jsonPath("$.detail").value("El cliente ya está archivado."));
		this.mvc.perform(get("/customers/" + this.carlosCustomer).with(as(ADMIN)))
			.andExpect(jsonPath("$.version").value(1));
	}

	@Test
	void anAgentCannotArchiveOrRestore() throws Exception {
		this.mvc.perform(post("/customers/" + this.carlosCustomer + "/archive").with(as(LAURA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("archiveCustomer"));
		this.data.archiveCustomer(this.anaCustomer, TestClockConfiguration.START);
		this.mvc.perform(post("/customers/" + this.anaCustomer + "/restore").with(as(LAURA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("restoreCustomer"));
		// El 403 llega antes que cualquier comprobación de datos: ni siquiera con un id inexistente.
		this.mvc.perform(post("/customers/" + UUID.randomUUID() + "/archive").with(as(LAURA)))
			.andExpect(status().isForbidden());
		this.mvc.perform(get("/customers/" + this.carlosCustomer).with(as(LAURA)))
			.andExpect(jsonPath("$.archived").value(false));
		this.mvc.perform(get("/customers/" + this.anaCustomer).with(as(LAURA)))
			.andExpect(jsonPath("$.archived").value(true));
	}

	@Test
	void restoringBringsTheCustomerBack() throws Exception {
		assertThat(archive(ADMIN, this.carlosCustomer).getResponse().getStatus()).isEqualTo(200);
		this.mvc.perform(post("/customers/" + this.carlosCustomer + "/restore").with(as(ADMIN)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("restoreCustomer"))
			.andExpect(header().string("ETag", "\"2\""))
			.andExpect(jsonPath("$.archived").value(false))
			.andExpect(jsonPath("$.archivedAt").isEmpty())
			.andExpect(jsonPath("$.version").value(2));
		assertThat(listAs(LAURA, "").path("items").findValuesAsString("name")).contains("Carlos Ruiz");
		// Restaurar uno activo no tiene sentido.
		this.mvc.perform(post("/customers/" + this.carlosCustomer + "/restore").with(as(ADMIN)))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("restoreCustomer"))
			.andExpect(jsonPath("$.detail").value("El cliente no está archivado."));
		// Y vuelve a poder editarse.
		MvcResult edited = patchCustomer(ADMIN, this.carlosCustomer, "2", "{\"company\": \"De vuelta\"}");
		assertThat(edited.getResponse().getStatus()).isEqualTo(200);
	}

	@Test
	void aForeignCustomerCannotBeArchivedOrRestored() throws Exception {
		this.mvc.perform(post("/customers/" + this.northwindCustomer + "/archive").with(as(ADMIN)))
			.andExpect(status().isNotFound())
			.andExpect(matchesContract("archiveCustomer"));
		this.mvc.perform(post("/customers/" + this.northwindCustomer + "/restore").with(as(ADMIN)))
			.andExpect(status().isNotFound())
			.andExpect(matchesContract("restoreCustomer"));
		this.mvc.perform(get("/customers/" + this.northwindCustomer).with(as(NORTHWIND_AGENT)))
			.andExpect(jsonPath("$.archived").value(false))
			.andExpect(jsonPath("$.version").value(0));
	}

	@Test
	void aMemberOfAnArchivedCustomerGets401() throws Exception {
		this.mvc.perform(get("/tickets").with(as(MARIA))).andExpect(status().isOk());
		assertThat(archive(ADMIN, this.mariaCustomer).getResponse().getStatus()).isEqualTo(200);
		this.mvc.perform(get("/tickets").with(as(MARIA)))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("listTickets"));
		this.mvc.perform(get("/me").with(as(MARIA)))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("getMe"));
		// Al restaurar, el acceso se reanuda.
		assertThat(restore(ADMIN, this.mariaCustomer).getResponse().getStatus()).isEqualTo(200);
		this.mvc.perform(get("/tickets").with(as(MARIA))).andExpect(status().isOk());
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
			.perform(post("/tickets").with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON).content("""
					{"customerId": "%s", "subject": "%s", "description": "Detalle"}""".formatted(customerId, subject)))
			.andReturn();
	}

}
