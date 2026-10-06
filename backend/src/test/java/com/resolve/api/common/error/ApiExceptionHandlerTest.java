package com.resolve.api.common.error;

import java.sql.SQLException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Traducción de las excepciones de negocio a Problem Details, sin levantar la aplicación. */
@ExtendWith(OutputCaptureExtension.class)
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

	@Test
	void invalidByteSequenceFromPostgresqlIsA400() throws Exception {
		this.mvc.perform(get("/nul"))
			.andExpect(status().isBadRequest())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.title").value("Petición no válida"));
	}

	@Test
	void otherIntegrityViolationsAreNotHiddenAsClientErrors() {
		assertThatThrownBy(() -> this.mvc.perform(get("/integrity")))
			.hasRootCauseInstanceOf(SQLException.class);
	}

	@Test
	void aLockTimeoutIsLoggedWithTheUriTheClientSeesAsTheInstance(CapturedOutput output) throws Exception {
		this.mvc.perform(get("/lock")).andExpect(status().isServiceUnavailable());

		assertThat(output.getAll()).contains("Request failed with status 503 on /lock");
	}

	@Test
	void aLockTimeoutIsA503WithRetryAfter() throws Exception {
		this.mvc.perform(get("/lock"))
			.andExpect(status().isServiceUnavailable())
			.andExpect(header().string("Retry-After", "1"))
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
			.andExpect(jsonPath("$.title").value("Recurso ocupado"));
	}

	@Test
	void aDeadlockThatReachesUsAsTheSameExceptionIsNotHiddenAsALockTimeout() {
		assertThatThrownBy(() -> this.mvc.perform(get("/deadlock"))).hasRootCauseInstanceOf(SQLException.class)
			.rootCause()
			.hasFieldOrPropertyWithValue("SQLState", "40P01");
	}

	@RestController
	static class Thrower {

		@GetMapping("/lock")
		String lock() {
			throw new CannotAcquireLockException("could not obtain lock",
					new SQLException("canceling statement due to lock timeout", "55P03"));
		}

		@GetMapping("/deadlock")
		String deadlock() {
			throw new CannotAcquireLockException("could not obtain lock",
					new SQLException("deadlock detected", "40P01"));
		}

		@GetMapping("/nul")
		String nul() {
			throw new DataIntegrityViolationException("could not execute statement",
					new SQLException("invalid byte sequence for encoding \"UTF8\": 0x00", "22021"));
		}

		@GetMapping("/integrity")
		String integrity() {
			throw new DataIntegrityViolationException("could not execute statement",
					new SQLException("duplicate key", "23505"));
		}

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
