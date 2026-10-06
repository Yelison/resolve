package com.resolve.api.common.security;

import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

import com.resolve.api.support.ApiAccess;
import com.resolve.api.support.ApiAccess.Role;
import com.resolve.api.support.ApiIntegrationTest;
import com.resolve.api.support.OpenApiContract;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Cada operación del contrato, con cada rol y sin sesión, contra la cadena de seguridad de {@code dev}/{@code test}.
 * El prefijo {@code /api} se añade a los controladores en un sitio (ApiPathPrefix) y a las reglas de seguridad en otro;
 * si dejaran de coincidir, una operación quedaría abierta o cerrada sin que ningún otro test lo viera, porque cada uno
 * prueba una operación con el rol que espera.
 */
class ApiAccessMatrixTest extends ApiIntegrationTest {

	@Test
	void theContractPublishesTheApiUnderTheSamePrefixAsTheControllers() {
		assertThat(OpenApiContract.serverUrl()).isEqualTo(API);
	}

	@Test
	void theAccessTableHasARowForEveryOperationOfTheContractAndNoOther() {
		Set<String> inContract = new TreeSet<>(OpenApiContract.operationIds());
		Set<String> inTable = new TreeSet<>(ApiAccess.allowed().keySet());
		assertThat(inTable).isEqualTo(inContract);
	}

	@Test
	void everyOperationAnswersAsTheTableSaysForEveryRoleAndForAnonymous() throws Exception {
		UUID acme = this.data.organization("Acme");
		this.data.staff(acme, "admin", "Ana", "ana@acme.example");
		this.data.staff(acme, "agent", "Alberto", "alberto@acme.example");
		UUID customer = this.data.customer(acme, "Clara", "clara@cliente.example", "Cliente SA");
		this.data.customerUser(acme, customer, "Clara", "clara@cliente.example");

		Map<Role, RequestPostProcessor> credentials = Map.of(Role.ADMIN, as("ana@acme.example"), Role.AGENT,
				as("alberto@acme.example"), Role.CUSTOMER, as("clara@cliente.example"));

		assertThat(ApiAccess.violations(this.mvc, credentials, (request) -> request)).isEmpty();
	}

	@Test
	void everyWriteOfTheContractAnswers409BeforeTheControllerWhenTheOrganizationShownIsNotTheSessionOne()
			throws Exception {
		UUID acme = this.data.organization("Acme");
		this.data.staff(acme, "admin", "Ana", "ana@acme.example");

		assertThat(ApiAccess.organizationHeaderViolations(this.mvc, as("ana@acme.example"))).isEmpty();
	}

}
