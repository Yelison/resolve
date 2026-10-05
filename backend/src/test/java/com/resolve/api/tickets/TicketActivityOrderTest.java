package com.resolve.api.tickets;

import java.util.List;

import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Las actividades de una misma petición comparten {@code createdAt}: el historial las devuelve, de la más reciente
 * a la más antigua, en el orden inverso al de inserción, siempre.
 */
class TicketActivityOrderTest extends TicketsFixture {

	@RepeatedTest(25)
	void activitiesOfOneRequestComeBackInInsertionOrder() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "Ticket", "urgent", this.laura);
		patchTicket(LAURA, 1, 0, """
				{"status": "in_progress", "priority": "high", "assigneeId": "%s"}
				""".formatted(this.daniel));

		assertThat(history(1)).containsExactly("assignee_changed", "priority_changed", "status_changed",
				"assignee_changed", "created");
	}

	@Test
	void everyTicketKeepsItsOwnOrderWhenManyAreWrittenBackToBack() throws Exception {
		for (int index = 1; index <= 40; index++) {
			createTicket(LAURA, this.mariaCustomer, "Ticket " + index, "urgent", this.laura);
			patchTicket(LAURA, index, 0, "{\"status\": \"resolved\", \"priority\": \"low\", \"assigneeId\": null}");
			assertThat(history(index)).as("ticket %d", index)
				.containsExactly("assignee_changed", "priority_changed", "status_changed", "assignee_changed",
						"created");
		}
	}

	private List<String> history(int number) throws Exception {
		String body = this.mvc.perform(get(API + "/tickets/" + number + "/activity").with(as(LAURA)))
			.andExpect(status().isOk())
			.andReturn()
			.getResponse()
			.getContentAsString();
		return JSON.readTree(body).valueStream().map((JsonNode node) -> node.get("type").asString()).toList();
	}

}
