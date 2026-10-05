package com.resolve.api.customers;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import com.resolve.api.support.TestClockConfiguration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Alta, lectura y edición de clientes: validación, aislamiento entre organizaciones y control de versión. */
class CustomerEditApiTest extends CustomersFixture {

	// --- Crear -------------------------------------------------------------------------------------------------

	@Test
	void createsACustomerAndReturnsLocationAndEtag() throws Exception {
		this.mvc.perform(post(API + "/customers").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"name": "  Lucía Vega ", "email": " lucia@vega.example ", "company": " Vega & Co ", "notes": "VIP"}
				"""))
			.andExpect(status().isCreated())
			.andExpect(matchesContract("createCustomer"))
			.andExpect(header().string("ETag", "\"0\""))
			.andExpect(header().string("Location", org.hamcrest.Matchers.startsWith("http://localhost/api/customers/")))
			.andExpect(jsonPath("$.name").value("Lucía Vega"))
			.andExpect(jsonPath("$.email").value("lucia@vega.example"))
			.andExpect(jsonPath("$.company").value("Vega & Co"))
			.andExpect(jsonPath("$.notes").value("VIP"))
			.andExpect(jsonPath("$.version").value(0))
			.andExpect(jsonPath("$.openTickets").value(0))
			.andExpect(jsonPath("$.totalTickets").value(0))
			.andExpect(jsonPath("$.archived").value(false))
			.andExpect(jsonPath("$.archivedAt").isEmpty())
			.andExpect(jsonPath("$.portalAccess").value("none"))
			.andExpect(jsonPath("$.createdAt").value(TestClockConfiguration.START.toString()));
	}

	@Test
	void theNewCustomerBelongsToTheCallersOrganizationAndShowsUpInItsList() throws Exception {
		JsonNode created = createCustomer(ADMIN, """
				{"name": "Lucía Vega", "email": "lucia@vega.example"}""");
		assertThat(listAs(ADMIN, "?q=lucia").path("items").get(0).path("id").asString())
			.isEqualTo(created.path("id").asString());
		assertThat(listAs(NORTHWIND_AGENT, "?q=lucia").path("totalItems").asInt()).isZero();
	}

	@Test
	void emptyCompanyAndNotesAreStoredAsNull() throws Exception {
		JsonNode created = createCustomer(ADMIN, """
				{"name": "Lucía Vega", "email": "lucia@vega.example", "company": "  ", "notes": ""}""");
		assertThat(created.path("company").isNull()).isTrue();
		assertThat(created.path("notes").isNull()).isTrue();
	}

	@Test
	void rejectsADuplicateEmailWithAFieldError() throws Exception {
		// Sin distinguir mayúsculas, y también cuando el duplicado está archivado.
		this.mvc.perform(post(API + "/customers").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"name": "Otra María", "email": "MARIA@Cliente.example"}"""))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createCustomer"))
			.andExpect(jsonPath("$.errors[0].field").value("email"))
			.andExpect(jsonPath("$.errors[0].message").value("Ya existe un cliente con este correo."));
		this.data.archiveCustomer(this.carlosCustomer, Instant.parse("2026-10-01T10:00:00Z"));
		this.mvc.perform(post(API + "/customers").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"name": "Otro Carlos", "email": "carlos@northstar.example"}"""))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[0].field").value("email"));
	}

	@Test
	void theSameEmailInAnotherOrganizationIsNotADuplicate() throws Exception {
		// marta@soler.example existe en Northwind; en Acme está libre y el 400 no revela que exista allí.
		this.mvc.perform(post(API + "/customers").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"name": "Marta Acme", "email": "marta@soler.example"}"""))
			.andExpect(status().isCreated());
	}

	@Test
	void rejectsAnInvalidEmailAndALongName() throws Exception {
		this.mvc.perform(post(API + "/customers").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"name": "%s", "email": "no-es-un-correo", "company": "%s", "notes": "%s"}
				""".formatted("N".repeat(121), "C".repeat(121), "x".repeat(2001))))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createCustomer"))
			.andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("name", "email", "company", "notes")));
		this.mvc.perform(post(API + "/customers").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"name": "   ", "company": "Sin correo"}"""))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("name", "email")));
	}

	@Test
	void anOrganizationIdInTheBodyIsRejectedNeverObeyed() throws Exception {
		this.mvc.perform(post(API + "/customers").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"name": "Intruso", "email": "intruso@example.com", "organizationId": "%s"}""".formatted(this.northwind)))
			.andExpect(status().isBadRequest());
		assertThat(listAs(NORTHWIND_AGENT, "?q=intruso").path("totalItems").asInt()).isZero();
	}

	@Test
	void rejectsNonTextScalarsInTheBodyLikeThePatchDoes() throws Exception {
		this.mvc.perform(post(API + "/customers").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"name": 123, "email": "num@example.com", "company": true, "notes": 7}"""))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createCustomer"))
			.andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("name", "company", "notes")))
			.andExpect(jsonPath("$.errors[0].message").value("Debe ser un texto."));
		this.mvc.perform(post(API + "/customers").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"name": "Ok", "email": ["a@b.co"]}"""))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[0].field").value("email"));
		// Nada se creó: «true» no aparece como empresa.
		this.mvc.perform(get(API + "/customers/companies").with(as(LAURA)))
			.andExpect(jsonPath("$", org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("true"))));
	}

	@Test
	void rejectsControlCharactersInTheirOwnField() throws Exception {
		// PostgreSQL no admite el byte 0: antes se notificaba como «correo duplicado».
		this.mvc.perform(post(API + "/customers").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"name": "Nu\\u0000lo", "email": "nul@example.com", "company": "A\\u0007B"}"""))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createCustomer"))
			.andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("name", "company")))
			.andExpect(jsonPath("$.errors[0].message").value("No admite caracteres de control."));
		this.mvc.perform(patch(API + "/customers/" + this.carlosCustomer).with(as(LAURA))
			.header("If-Match", "\"0\"")
			.contentType("application/merge-patch+json")
			.content("{\"notes\": \"a\\u0000b\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("updateCustomer"))
			.andExpect(jsonPath("$.errors[0].field").value("notes"));
		// Los saltos de línea sí son válidos en las notas.
		MvcResult multiline = patchCustomer(LAURA, this.carlosCustomer, "0", "{\"notes\": \"Línea 1\\nLínea 2\"}");
		assertThat(multiline.getResponse().getStatus()).isEqualTo(200);
	}

	// --- Leer --------------------------------------------------------------------------------------------------

	@Test
	void portalAccessFollowsTheMembershipStatus() throws Exception {
		UUID invited = this.data.customer(this.acme, "Cliente Invitado", "invitado@cliente.example", null);
		this.data.customerUser(this.acme, invited, "Cliente Invitado", "invitado@cliente.example", "invited");
		UUID removed = this.data.customer(this.acme, "Cliente Retirado", "retirado@cliente.example", null);
		this.data.customerUser(this.acme, removed, "Cliente Retirado", "retirado@cliente.example", "removed");

		this.mvc.perform(get(API + "/customers/" + invited).with(as(LAURA)))
			.andExpect(matchesContract("getCustomer"))
			.andExpect(jsonPath("$.portalAccess").value("invited"));
		this.mvc.perform(get(API + "/customers/" + removed).with(as(LAURA)))
			.andExpect(jsonPath("$.portalAccess").value("none"));
		// El archivado suspende el acceso sin cambiar el campo, que sigue reflejando solo la membresía.
		this.data.archiveCustomer(invited, TestClockConfiguration.START);
		this.mvc.perform(get(API + "/customers/" + invited).with(as(LAURA)))
			.andExpect(jsonPath("$.archived").value(true))
			.andExpect(jsonPath("$.portalAccess").value("invited"));
	}

	@Test
	void getsACustomerOfTheOrganizationAndHidesForeignOnes() throws Exception {
		this.data.ticket(this.acme, this.mariaCustomer, 1, "open");
		this.data.ticket(this.acme, this.mariaCustomer, 2, "resolved");
		this.mvc.perform(get(API + "/customers/" + this.mariaCustomer).with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getCustomer"))
			.andExpect(header().string("ETag", "\"0\""))
			.andExpect(jsonPath("$.name").value("María Pérez"))
			.andExpect(jsonPath("$.openTickets").value(1))
			.andExpect(jsonPath("$.totalTickets").value(2))
			.andExpect(jsonPath("$.portalAccess").value("active"));
		this.mvc.perform(get(API + "/customers/" + this.carlosCustomer).with(as(LAURA)))
			.andExpect(jsonPath("$.portalAccess").value("none"));

		// Un cliente de otra organización y uno inexistente responden exactamente igual.
		MvcResult foreign = getCustomer(LAURA, this.northwindCustomer);
		MvcResult unknown = getCustomer(LAURA, UUID.randomUUID());
		assertThat(foreign.getResponse().getStatus()).isEqualTo(404);
		assertThat(unknown.getResponse().getStatus()).isEqualTo(404);
		assertThat(body(foreign).path("title")).isEqualTo(body(unknown).path("title"));
		assertThat(body(foreign).path("detail")).isEqualTo(body(unknown).path("detail"));
		this.mvc.perform(get(API + "/customers/" + this.northwindCustomer).with(as(LAURA)))
			.andExpect(matchesContract("getCustomer"));
	}

	@Test
	void anArchivedCustomerCanStillBeRead() throws Exception {
		this.data.archiveCustomer(this.carlosCustomer, Instant.parse("2026-10-01T10:00:00Z"));
		this.mvc.perform(get(API + "/customers/" + this.carlosCustomer).with(as(LAURA)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.archived").value(true))
			.andExpect(jsonPath("$.archivedAt").value("2026-10-01T10:00:00Z"));
	}

	@Test
	void aMalformedIdIsABadRequest() throws Exception {
		this.mvc.perform(get(API + "/customers/no-es-un-uuid").with(as(LAURA)))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("getCustomer"))
			.andExpect(jsonPath("$.errors[0].field").value("id"));
	}

	// --- Editar ------------------------------------------------------------------------------------------------

	@Test
	void patchesWithIfMatchAndBumpsTheVersion() throws Exception {
		MvcResult result = patchCustomer(LAURA, this.carlosCustomer, "0",
				"{\"name\": \"  Carlos R. Ruiz \", \"company\": \"Northstar Labs\"}");
		assertThat(result.getResponse().getStatus()).isEqualTo(200);
		assertThat(result.getResponse().getHeader("ETag")).isEqualTo("\"1\"");
		assertThat(body(result).path("name").asString()).isEqualTo("Carlos R. Ruiz");
		assertThat(body(result).path("company").asString()).isEqualTo("Northstar Labs");
		assertThat(body(result).path("version").asInt()).isEqualTo(1);
		this.mvc.perform(get(API + "/customers/" + this.carlosCustomer).with(as(LAURA)))
			.andExpect(jsonPath("$.name").value("Carlos R. Ruiz"))
			.andExpect(jsonPath("$.email").value("carlos@northstar.example"))
			.andExpect(header().string("ETag", "\"1\""));
		this.mvc.perform(patch(API + "/customers/" + this.carlosCustomer).with(as(ADMIN))
			.header("If-Match", "\"1\"")
			.contentType("application/merge-patch+json")
			.content("{\"notes\": \"Prefiere llamadas.\"}"))
			.andExpect(status().isOk())
			.andExpect(matchesContract("updateCustomer"))
			.andExpect(jsonPath("$.notes").value("Prefiere llamadas."))
			.andExpect(jsonPath("$.version").value(2));
	}

	@Test
	void aStalePatchIsRejectedWith412() throws Exception {
		assertThat(patchCustomer(LAURA, this.carlosCustomer, "0", "{\"company\": \"Primera\"}").getResponse()
			.getStatus()).isEqualTo(200);
		this.mvc.perform(patch(API + "/customers/" + this.carlosCustomer).with(as(ADMIN))
			.header("If-Match", "\"0\"")
			.contentType("application/merge-patch+json")
			.content("{\"company\": \"Segunda\"}"))
			.andExpect(status().isPreconditionFailed())
			.andExpect(matchesContract("updateCustomer"))
			.andExpect(jsonPath("$.detail").value("El cliente cambió desde que lo abriste. Vuelve a cargarlo para ver los cambios."));
		this.mvc.perform(get(API + "/customers/" + this.carlosCustomer).with(as(LAURA)))
			.andExpect(jsonPath("$.company").value("Primera"))
			.andExpect(jsonPath("$.version").value(1));
	}

	@Test
	void aPatchWithoutIfMatchIsRejectedWith428() throws Exception {
		this.mvc.perform(patch(API + "/customers/" + this.carlosCustomer).with(as(LAURA))
			.contentType("application/merge-patch+json")
			.content("{\"company\": \"Sin versión\"}"))
			.andExpect(status().isPreconditionRequired())
			.andExpect(matchesContract("updateCustomer"));
		// Un validador débil, una lista o * son un 400 sobre If-Match.
		for (String invalid : List.of("W/\"0\"", "*", "\"0\", \"1\"")) {
			this.mvc.perform(patch(API + "/customers/" + this.carlosCustomer).with(as(LAURA))
				.header("If-Match", invalid)
				.contentType("application/merge-patch+json")
				.content("{\"company\": \"X\"}"))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors[0].field").value("If-Match"));
		}
	}

	@Test
	void nullClearsCompanyAndNotes() throws Exception {
		assertThat(patchCustomer(LAURA, this.carlosCustomer, "0", "{\"notes\": \"Algo\"}").getResponse().getStatus())
			.isEqualTo(200);
		MvcResult cleared = patchCustomer(LAURA, this.carlosCustomer, "1", "{\"company\": null, \"notes\": null}");
		assertThat(cleared.getResponse().getStatus()).isEqualTo(200);
		assertThat(body(cleared).path("company").isNull()).isTrue();
		assertThat(body(cleared).path("notes").isNull()).isTrue();
		// name y email no aceptan null.
		this.mvc.perform(patch(API + "/customers/" + this.carlosCustomer).with(as(LAURA))
			.header("If-Match", "\"2\"")
			.contentType("application/merge-patch+json")
			.content("{\"name\": null, \"email\": null}"))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("updateCustomer"))
			.andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("name", "email")));
	}

	@Test
	void aPatchThatChangesNothingKeepsTheVersion() throws Exception {
		MvcResult result = patchCustomer(LAURA, this.carlosCustomer, "0",
				"{\"name\": \"Carlos Ruiz\", \"company\": \"northstar\"}".replace("northstar", "Northstar"));
		assertThat(result.getResponse().getStatus()).isEqualTo(200);
		assertThat(result.getResponse().getHeader("ETag")).isEqualTo("\"0\"");
		assertThat(body(result).path("version").asInt()).isZero();
	}

	@Test
	void rejectsEmptyUnknownAndDuplicateEmailPatches() throws Exception {
		this.mvc.perform(patch(API + "/customers/" + this.carlosCustomer).with(as(LAURA))
			.header("If-Match", "\"0\"")
			.contentType("application/merge-patch+json")
			.content("{}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[0].field").value("body"));
		this.mvc.perform(patch(API + "/customers/" + this.carlosCustomer).with(as(LAURA))
			.header("If-Match", "\"0\"")
			.contentType("application/merge-patch+json")
			.content("{\"archivedAt\": null, \"organizationId\": \"x\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("archivedAt", "organizationId")));
		this.mvc.perform(patch(API + "/customers/" + this.carlosCustomer).with(as(LAURA))
			.header("If-Match", "\"0\"")
			.contentType("application/merge-patch+json")
			.content("{\"email\": \"MARIA@cliente.example\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[0].field").value("email"))
			.andExpect(jsonPath("$.errors[0].message").value("Ya existe un cliente con este correo."));
		// Cambiar solo las mayúsculas del propio correo no es un duplicado.
		MvcResult own = patchCustomer(LAURA, this.carlosCustomer, "0", "{\"email\": \"Carlos@Northstar.example\"}");
		assertThat(own.getResponse().getStatus()).isEqualTo(200);
	}

	@Test
	void patchingAnArchivedCustomerIsAConflict() throws Exception {
		this.data.archiveCustomer(this.carlosCustomer, Instant.parse("2026-10-01T10:00:00Z"));
		this.mvc.perform(patch(API + "/customers/" + this.carlosCustomer).with(as(LAURA))
			.header("If-Match", "\"0\"")
			.contentType("application/merge-patch+json")
			.content("{\"company\": \"Nueva\"}"))
			.andExpect(status().isConflict())
			.andExpect(matchesContract("updateCustomer"))
			.andExpect(jsonPath("$.status").value(409))
			.andExpect(jsonPath("$.detail").value("Restaura el cliente antes de editarlo."));
		this.mvc.perform(get(API + "/customers/" + this.carlosCustomer).with(as(LAURA)))
			.andExpect(jsonPath("$.company").value("Northstar"));
	}

	@Test
	void checksErrorsInTheContractOrder() throws Exception {
		// 404 antes que 428: el cliente no existe aunque falte If-Match.
		this.mvc.perform(patch(API + "/customers/" + UUID.randomUUID()).with(as(LAURA))
			.contentType("application/merge-patch+json")
			.content("{}"))
			.andExpect(status().isNotFound());
		// 428 antes que 400: el cuerpo es inválido pero falta If-Match.
		this.mvc.perform(patch(API + "/customers/" + this.carlosCustomer).with(as(LAURA))
			.contentType("application/merge-patch+json")
			.content("{}"))
			.andExpect(status().isPreconditionRequired());
		// 400 antes que 412: la versión es antigua pero el cuerpo es inválido.
		this.mvc.perform(patch(API + "/customers/" + this.carlosCustomer).with(as(LAURA))
			.header("If-Match", "\"9\"")
			.contentType("application/merge-patch+json")
			.content("{\"name\": \"\"}"))
			.andExpect(status().isBadRequest());
		// 412 antes que 409: archivado y con versión antigua se pide recargar primero.
		this.data.archiveCustomer(this.carlosCustomer, Instant.parse("2026-10-01T10:00:00Z"));
		this.mvc.perform(patch(API + "/customers/" + this.carlosCustomer).with(as(LAURA))
			.header("If-Match", "\"9\"")
			.contentType("application/merge-patch+json")
			.content("{\"company\": \"X\"}"))
			.andExpect(status().isPreconditionFailed());
	}

	@Test
	void aForeignCustomerCannotBeEdited() throws Exception {
		MvcResult result = patchCustomer(LAURA, this.northwindCustomer, "0", "{\"company\": \"Intruso\"}");
		assertThat(result.getResponse().getStatus()).isEqualTo(404);
		MvcResult unknown = patchCustomer(LAURA, UUID.randomUUID(), "0", "{\"company\": \"Intruso\"}");
		assertThat(body(result).path("detail")).isEqualTo(body(unknown).path("detail"));
		// Ni con una versión antigua ni con un cuerpo inválido se distingue de uno inexistente: sigue siendo un 404.
		assertThat(patchCustomer(LAURA, this.northwindCustomer, "9", "{\"company\": \"X\"}").getResponse()
			.getStatus()).isEqualTo(404);
		assertThat(patchCustomer(LAURA, this.northwindCustomer, "0", "{}").getResponse().getStatus()).isEqualTo(404);
		this.mvc.perform(get(API + "/customers/" + this.northwindCustomer).with(as(NORTHWIND_AGENT)))
			.andExpect(jsonPath("$.company").value("Soler"))
			.andExpect(jsonPath("$.version").value(0));
	}

	@Test
	@Timeout(30)
	void twoConcurrentPatchesWithTheSameVersionYieldOne200AndOne412() throws Exception {
		ExecutorService executor = Executors.newFixedThreadPool(2);
		try {
			CountDownLatch start = new CountDownLatch(1);
			List<Future<Integer>> results = List.of("Una", "Otra").stream().map((company) -> executor.submit(() -> {
				start.await();
				return patchCustomer(LAURA, this.carlosCustomer, "0", "{\"company\": \"" + company + "\"}")
					.getResponse()
					.getStatus();
			})).toList();
			start.countDown();
			List<Integer> statuses = List.of(results.get(0).get(20, TimeUnit.SECONDS),
					results.get(1).get(20, TimeUnit.SECONDS));
			assertThat(statuses).containsExactlyInAnyOrder(200, 412);
			this.mvc.perform(get(API + "/customers/" + this.carlosCustomer).with(as(LAURA)))
				.andExpect(jsonPath("$.version").value(1));
		}
		finally {
			executor.shutdownNow();
		}
	}

	@Test
	@Timeout(30)
	void simultaneousCreationsWithTheSameEmailYieldOne201AndTheRestFieldErrors() throws Exception {
		int attempts = 8;
		ExecutorService executor = Executors.newFixedThreadPool(attempts);
		try {
			CountDownLatch start = new CountDownLatch(1);
			List<Future<Integer>> results = new ArrayList<>();
			for (int i = 0; i < attempts; i++) {
				String name = "Lucía " + i;
				results.add(executor.submit(() -> {
					start.await();
					return this.mvc
						.perform(post(API + "/customers").with(as(LAURA))
							.contentType(MediaType.APPLICATION_JSON)
							.content("{\"name\": \"" + name + "\", \"email\": \"lucia@vega.example\"}"))
						.andReturn()
						.getResponse()
						.getStatus();
				}));
			}
			start.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> result : results) {
				statuses.add(result.get(20, TimeUnit.SECONDS));
			}
			// Nunca un 500: quien pierde la carrera recibe el mismo 400 que un duplicado detectado antes.
			assertThat(statuses).containsOnly(201, 400);
			assertThat(statuses.stream().filter((status) -> status == 201).count()).isEqualTo(1);
			assertThat(listAs(LAURA, "?q=lucia@vega.example").path("totalItems").asInt()).isEqualTo(1);
		}
		finally {
			executor.shutdownNow();
		}
	}

	@Test
	@Timeout(40)
	void simultaneousPatchesToTheSameEmailYieldOne200AndTheRestFieldErrors() throws Exception {
		int attempts = 6;
		List<UUID> customers = new ArrayList<>();
		for (int i = 0; i < attempts; i++) {
			customers.add(this.data.customer(this.acme, "Carrera " + i, "carrera" + i + "@example.com", null));
		}
		ExecutorService executor = Executors.newFixedThreadPool(attempts);
		try {
			CountDownLatch start = new CountDownLatch(1);
			List<Future<Integer>> results = new ArrayList<>();
			for (UUID customer : customers) {
				results.add(executor.submit(() -> {
					start.await();
					return patchCustomer(LAURA, customer, "0", "{\"email\": \"destino@example.com\"}").getResponse()
						.getStatus();
				}));
			}
			start.countDown();
			List<Integer> statuses = new ArrayList<>();
			for (Future<Integer> result : results) {
				statuses.add(result.get(30, TimeUnit.SECONDS));
			}
			// Nunca un 500: quien pierde la carrera recibe el mismo 400 que un duplicado detectado antes.
			assertThat(statuses).containsOnly(200, 400);
			assertThat(statuses.stream().filter((status) -> status == 200).count()).isEqualTo(1);
			assertThat(listAs(LAURA, "?q=destino@example.com").path("totalItems").asInt()).isEqualTo(1);
		}
		finally {
			executor.shutdownNow();
		}
	}

	@Test
	void aNonCanonicalIdInThePathIsABadRequest() throws Exception {
		this.mvc.perform(get(API + "/customers/1-2-3-4-5").with(as(LAURA)))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("getCustomer"))
			.andExpect(jsonPath("$.errors[0].field").value("id"));
		this.mvc.perform(get(API + "/customers/" + this.carlosCustomer.toString().toUpperCase()).with(as(LAURA)))
			.andExpect(status().isOk());
	}

}
