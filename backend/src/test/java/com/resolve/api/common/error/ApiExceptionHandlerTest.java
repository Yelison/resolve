package com.resolve.api.common.error;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Traducción de las excepciones de negocio a Problem Details, sin levantar la aplicación. */
class ApiExceptionHandlerTest {

	private MockMvc mvc;

	@BeforeEach
	void setUp() {
		this.mvc = MockMvcBuilders.standaloneSetup(new Thrower()).setControllerAdvice(new ApiExceptionHandler()).build();
	}

	@Test
	void aConflictIsA409ProblemWithTheBusinessMessage() throws Exception {
		this.mvc.perform(get("/conflict"))
			.andExpect(status().isConflict())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.status").value(409))
			.andExpect(jsonPath("$.title").value("Conflicto"))
			.andExpect(jsonPath("$.detail").value("Restaura el cliente antes de editarlo."));
	}

	@Test
	void aStaleVersionStaysA412() throws Exception {
		this.mvc.perform(get("/stale"))
			.andExpect(status().isPreconditionFailed())
			.andExpect(jsonPath("$.title").value("El recurso cambió"))
			.andExpect(jsonPath("$.detail").value("Versión antigua."));
	}

	@Test
	void anOptimisticLockFailureIsA412ThatDoesNotMentionTickets() throws Exception {
		this.mvc.perform(get("/race"))
			.andExpect(status().isPreconditionFailed())
			.andExpect(jsonPath("$.detail").value("El recurso cambió mientras se guardaba. Vuelve a cargarlo e inténtalo de nuevo."));
	}

	@RestController
	static class Thrower {

		@GetMapping("/conflict")
		String conflict() {
			throw new ConflictException("Restaura el cliente antes de editarlo.");
		}

		@GetMapping("/stale")
		String stale() {
			throw new PreconditionFailedException("Versión antigua.");
		}

		@GetMapping("/race")
		String race() {
			throw new ObjectOptimisticLockingFailureException("Customer", "id");
		}

	}

}
