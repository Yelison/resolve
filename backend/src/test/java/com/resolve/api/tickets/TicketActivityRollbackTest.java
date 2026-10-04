package com.resolve.api.tickets;

import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

/** Si no se puede escribir el historial, el cambio del ticket tampoco se guarda. */
class TicketActivityRollbackTest extends TicketsFixture {

	@MockitoSpyBean
	TicketActivityRepository activities;

	@Test
	void aFailedActivityWriteRollsBackTheChange() throws Exception {
		createTicket(LAURA, this.mariaCustomer, "Ticket", "urgent", null);
		doThrow(new IllegalStateException("Fallo simulado al escribir el historial")).when(this.activities)
			.save(argThat((TicketActivity activity) -> activity.getType() == ActivityType.STATUS_CHANGED));

		assertThatThrownBy(() -> this.mvc.perform(patch("/tickets/1").with(as(LAURA))
			.contentType(TicketsController.MERGE_PATCH_JSON)
			.header("If-Match", "\"0\"")
			.content("{\"status\": \"resolved\"}"))).hasRootCauseMessage("Fallo simulado al escribir el historial");

		this.mvc.perform(get("/tickets/1").with(as(LAURA)))
			.andExpect(header().string("ETag", "\"0\""))
			.andExpect(jsonPath("$.status").value("open"));
	}

}
