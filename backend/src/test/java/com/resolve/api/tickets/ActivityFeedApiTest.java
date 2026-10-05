package com.resolve.api.tickets;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** El feed de actividad reciente de toda la organización, a partir de la actividad que escribe la API. */
class ActivityFeedApiTest extends TicketsFixture {

	@Test
	void recentActivityIsLimitedToTheOrganizationAndOrdered() throws Exception {
		step();
		createTicket(LAURA, this.mariaCustomer, "Acceso", "low", null); // 1: created
		step();
		createTicket(LAURA, this.carlosCustomer, "Pago", "medium", null); // 2: created
		step();
		patchTicket(LAURA, 1, 0, "{\"status\": \"in_progress\"}"); // status_changed
		step();
		patchTicket(LAURA, 2, 0, "{\"priority\": \"high\"}"); // priority_changed
		step();
		patchTicket(LAURA, 2, 1, "{\"assigneeId\": \"%s\"}".formatted(this.daniel)); // assignee_changed
		step();
		createTicket(NORTHWIND_AGENT, this.northwindCustomer, "Ajeno", "urgent", null); // otra organización
		step();
		// Las notas internas y las respuestas son mensajes, no actividad: no aparecen.
		reply(1, "internal");
		reply(1, "public");

		JsonNode feed = feed(LAURA, null);

		assertThat(feed).hasSize(5);
		assertThat(types(feed)).containsExactly("assignee_changed", "priority_changed", "status_changed", "created",
				"created");
		assertThat(feed.get(0).path("ticketNumber").asLong()).isEqualTo(2);
		assertThat(feed.get(0).path("subject").asString()).isEqualTo("Pago");
		assertThat(feed.at("/0/activity/to/name").asString()).isEqualTo("Daniel Santos");
		assertThat(feed.at("/0/activity/actor/name").asString()).isEqualTo("Laura Méndez");
		assertThat(feed.get(2).path("ticketNumber").asLong()).isEqualTo(1);
		assertThat(feed.get(2).path("subject").asString()).isEqualTo("Acceso");
		assertThat(feed.at("/2/activity/from").asString()).isEqualTo("open");
		assertThat(feed.at("/2/activity/to").asString()).isEqualTo("in_progress");
		assertThat(feed.at("/3/ticketNumber").asLong()).isEqualTo(2);
		assertThat(feed.at("/4/ticketNumber").asLong()).isEqualTo(1);
		List<String> subjects = new ArrayList<>();
		feed.forEach((item) -> subjects.add(item.path("subject").asString()));
		assertThat(subjects).doesNotContain("Ajeno");

		JsonNode northwind = feed(NORTHWIND_AGENT, null);
		assertThat(northwind).hasSize(1);
		assertThat(northwind.get(0).path("subject").asString()).isEqualTo("Ajeno");
		assertThat(northwind.at("/0/ticketNumber").asLong()).isEqualTo(1);
		assertThat(northwind.at("/0/activity/type").asString()).isEqualTo("created");

		JsonNode latestTwo = feed(DANIEL, "2");
		assertThat(types(latestTwo)).containsExactly("assignee_changed", "priority_changed");
	}

	@Test
	void theFeedDefaultsToTenEntriesAndAcceptsUpToFifty() throws Exception {
		for (int i = 1; i <= 12; i++) {
			step();
			createTicket(LAURA, this.mariaCustomer, "Ticket " + i, "low", null);
		}

		assertThat(feed(LAURA, null)).hasSize(10);
		assertThat(feed(LAURA, "1")).hasSize(1);
		assertThat(feed(LAURA, "50")).hasSize(12);
		assertThat(feed(ADMIN, null).get(0).path("subject").asString()).isEqualTo("Ticket 12");
	}

	@Test
	void anInvalidSizeIsRejectedWithAFieldError() throws Exception {
		for (String size : List.of("0", "51", "-1", "abc", "1.5")) {
			this.mvc.perform(get("/tickets/activity").queryParam("size", size).with(as(LAURA)))
				.andExpect(status().isBadRequest())
				.andExpect(matchesContract("listRecentActivity"))
				.andExpect(jsonPath("$.errors[0].field").value("size"));
		}
	}

	/** «activity» también casa con «/tickets/{number}»: el 403 debe llegar antes que cualquier lectura del número. */
	@Test
	void aCustomerGets403() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "De María", "low", null);

		this.mvc.perform(get("/tickets/activity").with(as(MARIA)))
			.andExpect(status().isForbidden())
			.andExpect(matchesContract("listRecentActivity"));
		this.mvc.perform(get("/tickets/activity").queryParam("size", "abc").with(as(MARIA)))
			.andExpect(status().isForbidden());
	}

	@Test
	void withoutAPrincipalTheFeedIs401() throws Exception {
		this.mvc.perform(get("/tickets/activity"))
			.andExpect(status().isUnauthorized())
			.andExpect(matchesContract("listRecentActivity"));
	}

	@Test
	void anEmptyOrganizationHasAnEmptyFeed() throws Exception {
		assertThat(feed(LAURA, null)).isEmpty();
	}

	private JsonNode feed(String asUser, String size) throws Exception {
		MvcResult result = this.mvc
			.perform((size != null) ? get("/tickets/activity").queryParam("size", size).with(as(asUser))
					: get("/tickets/activity").with(as(asUser)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("listRecentActivity"))
			.andReturn();
		return JSON.readTree(result.getResponse().getContentAsString());
	}

	private static List<String> types(JsonNode feed) {
		List<String> types = new ArrayList<>();
		feed.forEach((item) -> types.add(item.at("/activity/type").asString()));
		return types;
	}

	/** Cada acción ocurre en un instante distinto, así el orden esperado no depende del desempate por id. */
	private void step() {
		this.clock.advance(Duration.ofMinutes(1));
	}

	private void reply(long number, String visibility) throws Exception {
		this.mvc.perform(post("/tickets/{number}/messages", number).with(as(LAURA))
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\": \"Mensaje\", \"visibility\": \"%s\"}".formatted(visibility)))
			.andExpect(status().isCreated());
	}

}
