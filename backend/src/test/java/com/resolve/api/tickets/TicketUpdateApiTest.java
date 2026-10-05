package com.resolve.api.tickets;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class TicketUpdateApiTest extends TicketsFixture {

	@BeforeEach
	void seedTicket() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "No puedo acceder a mi cuenta", "urgent", this.laura);
	}

	@Test
	void changesFieldsBumpsTheVersionAndRecordsEachChange() throws Exception {
		this.mvc.perform(patch(API + "/tickets/1").with(as(DANIEL)).contentType(TicketsController.MERGE_PATCH_JSON)
			.header("If-Match", "\"0\"")
			.content("""
					{"status": "in_progress", "priority": "high", "assigneeId": "%s"}
					""".formatted(this.daniel)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("updateTicket"))
			.andExpect(header().string("ETag", "\"1\""))
			.andExpect(jsonPath("$.status").value("in_progress"))
			.andExpect(jsonPath("$.priority").value("high"))
			.andExpect(jsonPath("$.assignee.name").value("Daniel Santos"))
			.andExpect(jsonPath("$.version").value(1));
		this.mvc.perform(get(API + "/tickets/1/activity").with(as(LAURA)))
			.andExpect(matchesContract("listActivity"))
			.andExpect(jsonPath("$[?(@.type == 'status_changed')].from", contains("open")))
			.andExpect(jsonPath("$[?(@.type == 'status_changed')].to", contains("in_progress")))
			.andExpect(jsonPath("$[?(@.type == 'priority_changed')].to", contains("high")))
			.andExpect(jsonPath("$[?(@.type == 'assignee_changed' && @.to.name == 'Daniel Santos')].from.name",
					contains("Laura Méndez")))
			.andExpect(jsonPath("$[?(@.actor.name == 'Daniel Santos')]", hasSize(3)));
	}

	@Test
	void nullUnassignsWhileAbsentFieldsStayUnchanged() throws Exception {
		JsonNode ticket = patchTicket(LAURA, 1, 0, "{\"assigneeId\": null}");
		assertThat(ticket.get("assignee").isNull()).isTrue();
		assertThat(ticket.get("priority").asString()).isEqualTo("urgent");
		this.mvc.perform(get(API + "/tickets/1/activity").with(as(LAURA)))
			.andExpect(jsonPath("$[0].type").value("assignee_changed"))
			.andExpect(jsonPath("$[0].to").isEmpty());
	}

	@Test
	void aPatchThatChangesNothingKeepsTheVersionAndHistory() throws Exception {
		JsonNode ticket = patchTicket(LAURA, 1, 0, """
				{"status": "open", "priority": "urgent", "assigneeId": "%s"}
				""".formatted(this.laura));
		assertThat(ticket.get("version").asLong()).isZero();
		this.mvc.perform(get(API + "/tickets/1/activity").with(as(LAURA))).andExpect(jsonPath("$", hasSize(2)));
	}

	@Test
	void aStaleVersionIsRejectedWithoutLosingTheOtherChange() throws Exception {
		patchTicket(LAURA, 1, 0, "{\"status\": \"waiting\"}");
		this.mvc.perform(patch(API + "/tickets/1").with(as(DANIEL)).contentType(TicketsController.MERGE_PATCH_JSON)
			.header("If-Match", "\"0\"")
			.content("{\"priority\": \"low\"}"))
			.andExpect(status().isPreconditionFailed())
			.andExpect(matchesContract("updateTicket"));
		this.mvc.perform(get(API + "/tickets/1").with(as(LAURA)))
			.andExpect(header().string("ETag", "\"1\""))
			.andExpect(jsonPath("$.status").value("waiting"))
			.andExpect(jsonPath("$.priority").value("urgent"));
	}

	@Test
	void requiresAStrongIfMatch() throws Exception {
		this.mvc.perform(patch(API + "/tickets/1").with(as(LAURA)).contentType(TicketsController.MERGE_PATCH_JSON)
			.content("{\"status\": \"waiting\"}"))
			.andExpect(status().isPreconditionRequired())
			.andExpect(matchesContract("updateTicket"));
		this.mvc.perform(patch(API + "/tickets/1").with(as(LAURA)).contentType(TicketsController.MERGE_PATCH_JSON)
			.header("If-Match", "W/\"0\"")
			.content("{\"status\": \"waiting\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("updateTicket"));
	}

	@Test
	void checksErrorsInTheContractOrder() throws Exception {
		// 404 antes que 428: el ticket no existe aunque falte If-Match.
		this.mvc.perform(patch(API + "/tickets/99").with(as(LAURA)).contentType(TicketsController.MERGE_PATCH_JSON)
			.content("{\"status\": \"nope\"}")).andExpect(status().isNotFound()).andExpect(matchesContract("updateTicket"));
		// 428 antes que 400: el cuerpo es inválido pero falta If-Match.
		this.mvc.perform(patch(API + "/tickets/1").with(as(LAURA)).contentType(TicketsController.MERGE_PATCH_JSON)
			.content("{\"status\": \"nope\"}")).andExpect(status().isPreconditionRequired());
		// 400 antes que 412: versión vieja y cuerpo inválido.
		this.mvc.perform(patch(API + "/tickets/1").with(as(LAURA)).contentType(TicketsController.MERGE_PATCH_JSON)
			.header("If-Match", "\"7\"")
			.content("{\"status\": null, \"organizationId\": \"x\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[*].field", contains("organizationId", "status")));
	}

	@Test
	void anInvitedOrRemovedMemberCannotBeAssignedByPatch() throws Exception {
		UUID invited = this.data.staff(this.acme, "agent", "Inés Invitada", "invitada@acme.example", "invited");
		UUID removed = this.data.staff(this.acme, "agent", "Raúl Retirado", "retirado@acme.example", "removed");
		for (UUID assignee : new UUID[] { invited, removed }) {
			this.mvc.perform(patch(API + "/tickets/1").with(as(LAURA)).contentType(TicketsController.MERGE_PATCH_JSON)
				.header("If-Match", "\"0\"")
				.content("{\"assigneeId\": \"%s\"}".formatted(assignee)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors[0].field").value("assigneeId"));
		}
	}

	@Test
	void rejectsForeignAssigneesAndEmptyPatches() throws Exception {
		this.mvc.perform(patch(API + "/tickets/1").with(as(LAURA)).contentType(TicketsController.MERGE_PATCH_JSON)
			.header("If-Match", "\"0\"")
			.content("{\"assigneeId\": \"%s\"}".formatted(this.northwindAgent)))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.errors[0].field").value("assigneeId"));
		this.mvc.perform(patch(API + "/tickets/1").with(as(LAURA)).contentType(TicketsController.MERGE_PATCH_JSON)
			.header("If-Match", "\"0\"")
			.content("{}")).andExpect(status().isBadRequest()).andExpect(matchesContract("updateTicket"));
	}

	@Test
	void customersCannotUpdateEvenTheirOwnTickets() throws Exception {
		this.mvc.perform(patch(API + "/tickets/1").with(as(MARIA)).contentType(TicketsController.MERGE_PATCH_JSON)
			.header("If-Match", "\"0\"")
			.content("{\"status\": \"resolved\"}")).andExpect(status().isForbidden()).andExpect(matchesContract("updateTicket"));
	}

	@Test
	void aNonCanonicalAssigneeIdIsAFieldError() throws Exception {
		this.mvc.perform(patch(API + "/tickets/1").with(as(LAURA))
			.contentType(TicketsController.MERGE_PATCH_JSON)
			.header("If-Match", "\"0\"")
			.content("{\"assigneeId\": \"1-2-3-4-5\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(matchesContract("updateTicket"))
			.andExpect(jsonPath("$.errors[0].field").value("assigneeId"))
			.andExpect(jsonPath("$.errors[0].message").value("Debe ser un identificador válido."));
	}

}
