package com.resolve.api.tickets;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TicketCreationApiTest extends TicketsFixture {

	@Test
	void createsTheTicketWithDefaultsLocationAndEtag() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"customerId": "%s", "subject": "  No puedo acceder a mi cuenta ", "description": "El enlace venció."}
				""".formatted(this.mariaCustomer)))
			.andExpect(status().isCreated())
			.andExpect(matchesContract("createTicket"))
			.andExpect(header().string("Location", "http://localhost/api/tickets/1"))
			.andExpect(header().string("ETag", "\"0\""))
			.andExpect(jsonPath("$.number").value(1))
			.andExpect(jsonPath("$.subject").value("No puedo acceder a mi cuenta"))
			.andExpect(jsonPath("$.status").value("open"))
			.andExpect(jsonPath("$.priority").value("medium"))
			.andExpect(jsonPath("$.channel").value("web"))
			.andExpect(jsonPath("$.customer.name").value("María Pérez"))
			.andExpect(jsonPath("$.assignee").isEmpty())
			.andExpect(jsonPath("$.version").value(0));
	}

	@Test
	void recordsCreationAndInitialAssignmentInTheHistory() throws Exception {
		JsonNode ticket = createTicket(ADMIN, this.mariaCustomer, "Error de pago", "high", this.laura);
		this.mvc.perform(get(API + "/tickets/{number}/activity", ticket.get("number").asLong()).with(as(ADMIN)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listActivity"))
			.andExpect(jsonPath("$[*].type", containsInAnyOrder("created", "assignee_changed")))
			.andExpect(jsonPath("$[?(@.type == 'assignee_changed')].to.name", contains("Laura Méndez")))
			.andExpect(jsonPath("$[0].actor.name").value("Yelisson Ortiz"));
	}

	@Test
	void numbersAreSequentialPerOrganization() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "Uno", "low", null);
		createTicket(LAURA, this.carlosCustomer, "Dos", "low", null);
		JsonNode first = createTicket(NORTHWIND_AGENT, this.northwindCustomer, "Primero de Northwind", "low", null);
		assertThat(first.get("number").asLong()).isEqualTo(1);
		this.mvc.perform(get(API + "/tickets").with(as(LAURA)))
			.andExpect(jsonPath("$.items[*].number", containsInAnyOrder(1, 2)));
	}

	@Test
	void concurrentCreationsNeverReuseANumber() throws Exception {
		int attempts = 12;
		ExecutorService executor = Executors.newFixedThreadPool(6);
		CountDownLatch start = new CountDownLatch(1);
		Set<Long> numbers = ConcurrentHashMap.newKeySet();
		List<Callable<Void>> tasks = new ArrayList<>();
		for (int index = 0; index < attempts; index++) {
			int attempt = index;
			tasks.add(() -> {
				start.await();
				numbers.add(createTicket(LAURA, this.mariaCustomer, "Concurrente " + attempt, "low", null).get("number")
					.asLong());
				return null;
			});
		}
		List<Future<Void>> results = new ArrayList<>();
		tasks.forEach((task) -> results.add(executor.submit(task)));
		start.countDown();
		for (Future<Void> result : results) {
			result.get();
		}
		executor.shutdown();
		assertThat(numbers).hasSize(attempts).allSatisfy((number) -> assertThat(number).isBetween(1L, (long) attempts));
	}

	@Test
	void reportsEveryInvalidField() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"customerId": "no-es-un-id", "subject": " ", "description": "%s", "priority": "critica", "channel": "fax"}
				""".formatted("x".repeat(5001))))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createTicket"))
			.andExpect(jsonPath("$.errors[*].field",
					containsInAnyOrder("customerId", "subject", "description", "priority", "channel")));
	}

	@Test
	void unknownAndForeignReferencesGetTheSameError() throws Exception {
		String unknown = this.mvc
			.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
					{"customerId": "0192f000-0000-7000-8000-00000000dead", "subject": "A", "description": "B"}
					"""))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createTicket"))
			.andReturn()
			.getResponse()
			.getContentAsString();
		String foreign = this.mvc
			.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
					{"customerId": "%s", "subject": "A", "description": "B"}
					""".formatted(this.northwindCustomer)))
			.andExpect(status().isBadRequest())
			.andReturn()
			.getResponse()
			.getContentAsString();
		assertThat(JSON.readTree(foreign).get("errors")).isEqualTo(JSON.readTree(unknown).get("errors"));
	}

	@Test
	void theAssigneeMustBeStaffOfTheSameOrganization() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"customerId": "%s", "subject": "A", "description": "B", "assigneeId": "%s"}
				""".formatted(this.mariaCustomer, this.northwindAgent)))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[0].field").value("assigneeId"));
	}

	@Test
	void anInvitedOrRemovedMemberCannotBeTheAssignee() throws Exception {
		UUID invited = this.data.staff(this.acme, "agent", "Inés Invitada", "invitada@acme.example", "invited");
		UUID removed = this.data.staff(this.acme, "agent", "Raúl Retirado", "retirado@acme.example", "removed");
		for (UUID assignee : new UUID[] { invited, removed }) {
			this.mvc.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
					{"customerId": "%s", "subject": "A", "description": "B", "assigneeId": "%s"}
					""".formatted(this.mariaCustomer, assignee)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors[0].field").value("assigneeId"));
		}
	}

	@Test
	void ignoresNoOrganizationSentByTheClient() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"customerId": "%s", "subject": "A", "description": "B", "organizationId": "%s"}
				""".formatted(this.mariaCustomer, this.northwind)))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createTicket"));
	}

	@Test
	void customersCannotCreateTicketsEvenWithAnInvalidBody() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(MARIA)).contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("createTicket"));
	}

	@Test
	void nonTextScalarsInTextFieldsAreRejectedPerField() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"customerId": 1, "subject": 123, "description": true, "priority": 5, "channel": [], "assigneeId": 7}
				"""))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createTicket"))
			.andExpect(jsonPath("$.errors[*].field",
					containsInAnyOrder("customerId", "subject", "description", "priority", "channel", "assigneeId")))
			.andExpect(jsonPath("$.errors[?(@.field == 'subject')].message", contains("Debe ser un texto.")))
			.andExpect(jsonPath("$.errors[?(@.field == 'description')].message", contains("Debe ser un texto.")));
	}

	@Test
	void aNumericSubjectIsNotStoredAsText() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"customerId": "%s", "subject": 123, "description": "B"}
				""".formatted(this.mariaCustomer)))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[0].field").value("subject"))
			.andExpect(jsonPath("$.errors[0].message").value("Debe ser un texto."));
		this.mvc.perform(get(API + "/tickets/1").with(as(LAURA))).andExpect(status().isNotFound());
	}

	@Test
	void controlCharactersAreRejectedInTheSubjectButLayoutIsKeptInTheDescription() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"customerId": "%s", "subject": "a\\u0000b", "description": "c\\u0000d"}
				""".formatted(this.mariaCustomer)))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createTicket"))
			.andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("subject", "description")))
			.andExpect(jsonPath("$.errors[0].message").value("No admite caracteres de control."));
		this.mvc.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"customerId": "%s", "subject": "Asunto", "description": "Línea 1\\n\\tLínea 2"}
				""".formatted(this.mariaCustomer)))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.description").value("Línea 1\n\tLínea 2"));
	}

	@Test
	void nullIsOnlyAcceptedWhereTheContractAllowsIt() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"customerId": "%s", "subject": null, "description": "B", "priority": null, "assigneeId": null}
				""".formatted(this.mariaCustomer)))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("subject", "priority")))
			.andExpect(jsonPath("$.errors[?(@.field == 'subject')].message", contains("No admite null.")));
	}

	@Test
	void aBodyThatIsNotAnObjectIsRejected() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("[]"))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createTicket"))
			.andExpect(jsonPath("$.errors[0].field").value("body"));
	}

	@Test
	void unknownFieldsAreReportedByName() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"customerId": "%s", "subject": "A", "description": "B", "organizationId": "%s"}
				""".formatted(this.mariaCustomer, this.northwind)))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[0].field").value("organizationId"))
			.andExpect(jsonPath("$.errors[0].message").value("Campo no permitido."));
	}

	@Test
	void nonCanonicalUuidsInTheBodyAreFieldErrors() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"customerId": "1-2-3-4-5", "subject": "A", "description": "B", "assigneeId": "1-2-3-4-5"}
				"""))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("createTicket"))
			.andExpect(jsonPath("$.errors[*].field", containsInAnyOrder("customerId", "assigneeId")))
			.andExpect(jsonPath("$.errors[0].message").value("Debe ser un identificador válido."));
	}

	@Test
	void anUpperCaseCanonicalUuidCreatesTheTicket() throws Exception {
		this.mvc.perform(post(API + "/tickets").with(as(LAURA)).contentType(MediaType.APPLICATION_JSON).content("""
				{"customerId": "%s", "subject": "A", "description": "B", "assigneeId": "%s"}
				""".formatted(this.mariaCustomer.toString().toUpperCase(), this.laura.toString().toUpperCase())))
			.andExpect(status().isCreated())
			.andExpect(matchesContract("createTicket"));
	}

}
