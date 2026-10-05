package com.resolve.api.customers;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import com.resolve.api.support.ApiIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/** Comprueba que V3 y la entidad coinciden: Hibernate valida el esquema y los campos nuevos se leen de la fila. */
class CustomerPersistenceTest extends ApiIntegrationTest {

	@Autowired
	private CustomerRepository customers;

	@Autowired
	private JdbcClient jdbc;

	@Autowired
	private TransactionTemplate transaction;

	@Test
	void aNewCustomerHasNoNotesIsNotArchivedAndStartsAtVersionZero() {
		UUID organization = this.data.organization("Acme Studio");
		UUID id = this.data.customer(organization, "Ana García", "ana@orbit.example", "Orbit Labs");

		this.transaction.executeWithoutResult((status) -> {
			Customer customer = this.customers.findByOrganizationIdAndId(organization, id).orElseThrow();
			assertThat(customer.getNotes()).isNull();
			assertThat(customer.getArchivedAt()).isNull();
			assertThat(customer.getVersion()).isZero();
			assertThat(customer.getCreatedAt()).isNotNull();
		});
	}

	@Test
	void readsTheNotesAndTheArchiveInstantStoredInTheRow() {
		UUID organization = this.data.organization("Acme Studio");
		UUID id = this.data.customer(organization, "Ana García", "ana@orbit.example", "Orbit Labs");
		Instant archivedAt = Instant.parse("2026-10-01T10:15:00Z");
		this.jdbc.sql("UPDATE customers SET notes = ?, archived_at = ?, version = 4 WHERE id = ?")
			.params("Prefiere el correo.", Timestamp.from(archivedAt), id)
			.update();

		this.transaction.executeWithoutResult((status) -> {
			Customer customer = this.customers.findByOrganizationIdAndId(organization, id).orElseThrow();
			assertThat(customer.getNotes()).isEqualTo("Prefiere el correo.");
			assertThat(customer.getArchivedAt()).isEqualTo(archivedAt);
			assertThat(customer.getVersion()).isEqualTo(4);
		});
	}

}
