package com.resolve.api.reports;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static com.resolve.api.support.OpenApiContract.matchesContract;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Acme (America/Bogota: admin, dos agentes y una clienta con acceso) y Northwind (Europe/Madrid, un agente y un
 * cliente). Los tickets se insertan directamente con la fecha de creación que cada caso necesita; el reloj de los tests
 * empieza el 4 de octubre de 2026 a las 15:00 UTC (10:00 en Bogotá).
 */
abstract class ReportsFixture extends ApiIntegrationTest {

	static final String ADMIN = "admin@acme.example";

	static final String LAURA = "laura@acme.example";

	static final String DANIEL = "daniel@acme.example";

	static final String MARIA = "maria@cliente.example";

	static final String NORTHWIND_AGENT = "agente@northwind.example";

	static final JsonMapper JSON = JsonMapper.builder().build();

	UUID acme;

	UUID admin;

	UUID laura;

	UUID daniel;

	UUID customer;

	UUID northwind;

	UUID northwindAgent;

	UUID northwindCustomer;

	/** Los números insertados no chocan con los que asigna el contador de la organización. */
	private long nextNumber;

	@BeforeEach
	void seedOrganizations() {
		this.nextNumber = 1000;
		this.acme = this.data.organization("Acme Studio");
		this.admin = this.data.staff(this.acme, "admin", "Yelisson Ortiz", ADMIN);
		this.laura = this.data.staff(this.acme, "agent", "Laura Méndez", LAURA);
		this.daniel = this.data.staff(this.acme, "agent", "Daniel Santos", DANIEL);
		this.customer = this.data.customer(this.acme, "María Pérez", MARIA, "Acme Studio");
		this.data.customerUser(this.acme, this.customer, "María Pérez", MARIA);
		this.northwind = this.data.organization("Northwind Soporte", "Europe/Madrid");
		this.northwindAgent = this.data.staff(this.northwind, "agent", "Jordi Puig", NORTHWIND_AGENT);
		this.northwindCustomer = this.data.customer(this.northwind, "Marta Soler", "marta@soler.example", "Soler");
	}

	/** Instante de una fecha con desplazamiento explícito: {@code 2026-10-25T02:30:00+01:00}. */
	static Instant at(String isoWithOffset) {
		return OffsetDateTime.parse(isoWithOffset).toInstant();
	}

	/** Ticket abierto de Acme creado en ese instante. */
	UUID ticket(String channel, String createdAt) {
		return ticket(this.acme, this.customer, channel, createdAt);
	}

	UUID ticket(UUID organization, UUID customerId, String channel, String createdAt) {
		return this.data.ticket(organization, customerId, ++this.nextNumber, "open", channel, at(createdAt));
	}

	/** Organización nueva con un agente, un cliente y la zona indicada. */
	Seeded organizationIn(String name, String timeZone) {
		UUID organization = this.data.organization(name, timeZone);
		String email = "agente@" + name.toLowerCase() + ".example";
		UUID agent = this.data.staff(organization, "agent", "Agente " + name, email);
		UUID client = this.data.customer(organization, "Cliente " + name, "cliente@" + name.toLowerCase() + ".example",
				name);
		return new Seeded(organization, agent, "Agente " + name, email, client);
	}

	record Seeded(UUID organization, UUID agent, String agentName, String email, UUID customer) {

		UUID ticket(ReportsFixture fixture, String channel, String createdAt) {
			return fixture.ticket(this.organization, this.customer, channel, createdAt);
		}

		void resolve(ReportsFixture fixture, UUID ticket, String resolvedAt) {
			fixture.data.changeStatus(this.organization, ticket, this.agent, this.agentName, "resolved", at(resolvedAt));
		}

	}

	/** Pide el informe, comprueba el contrato y devuelve el cuerpo. {@code period} nulo usa el valor por defecto. */
	JsonNode summary(String email, String period) throws Exception {
		MvcResult result = this.mvc
			.perform((period != null) ? get("/reports/summary").queryParam("period", period).with(as(email))
					: get("/reports/summary").with(as(email)))
			.andExpect(status().isOk())
			.andExpect(matchesContract("getReportSummary"))
			.andReturn();
		return JSON.readTree(result.getResponse().getContentAsString());
	}

	static JsonNode day(JsonNode summary, String date) {
		for (JsonNode day : summary.path("byDay")) {
			if (date.equals(day.path("date").asString())) {
				return day;
			}
		}
		throw new AssertionError("El informe no tiene el día " + date + ": " + summary.path("byDay"));
	}

	/** Fechas del informe en orden, para comprobar que no faltan ni se repiten días. */
	static List<String> dates(JsonNode summary) {
		List<String> dates = new ArrayList<>();
		summary.path("byDay").forEach((day) -> dates.add(day.path("date").asString()));
		return dates;
	}

}
