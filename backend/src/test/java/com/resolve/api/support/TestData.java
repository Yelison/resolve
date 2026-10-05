package com.resolve.api.support;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import com.resolve.api.common.persistence.Ids;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Datos de prueba insertados directamente en la base, independientes de la API que se prueba. */
@TestComponent
public class TestData {

	private final JdbcClient jdbc;

	TestData(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** Vacía todas las tablas de negocio entre tests. */
	public void reset() {
		this.jdbc.sql("""
				TRUNCATE ticket_activities, ticket_messages, tickets, memberships, customers, users, organizations CASCADE
				""").update();
	}

	public UUID organization(String name) {
		return organization(name, "America/Bogota");
	}

	public UUID organization(String name, String timeZone) {
		UUID id = Ids.newId();
		this.jdbc.sql("INSERT INTO organizations (id, name, time_zone) VALUES (?, ?, ?)")
			.params(id, name, timeZone)
			.update();
		return id;
	}

	public UUID user(String name, String email) {
		UUID id = Ids.newId();
		this.jdbc.sql("INSERT INTO users (id, name, email) VALUES (?, ?, ?)").params(id, name, email).update();
		return id;
	}

	/** Usuario con membresía de administrador o agente. Devuelve el id del usuario. */
	public UUID staff(UUID organizationId, String role, String name, String email) {
		UUID userId = user(name, email);
		this.jdbc.sql("INSERT INTO memberships (id, organization_id, user_id, role) VALUES (?, ?, ?, ?)")
			.params(Ids.newId(), organizationId, userId, role)
			.update();
		return userId;
	}

	public UUID customer(UUID organizationId, String name, String email, String company) {
		UUID id = Ids.newId();
		this.jdbc.sql("INSERT INTO customers (id, organization_id, name, email, company) VALUES (?, ?, ?, ?, ?)")
			.params(id, organizationId, name, email, company)
			.update();
		return id;
	}

	/** Cliente con fecha de alta explícita (el reloj de la base de datos no sirve para probar orden ni «este mes»). */
	public UUID customer(UUID organizationId, String name, String email, String company, Instant createdAt) {
		UUID id = Ids.newId();
		this.jdbc
			.sql("INSERT INTO customers (id, organization_id, name, email, company, created_at) VALUES (?, ?, ?, ?, ?, ?)")
			.params(id, organizationId, name, email, company, Timestamp.from(createdAt))
			.update();
		return id;
	}

	public UUID customerIdByEmail(UUID organizationId, String email) {
		return this.jdbc.sql("SELECT id FROM customers WHERE organization_id = ? AND lower(email) = lower(?)")
			.params(organizationId, email)
			.query(UUID.class)
			.single();
	}

	/** Archiva un cliente directamente en la base, sin pasar por la API. */
	public void archiveCustomer(UUID customerId, Instant archivedAt) {
		this.jdbc.sql("UPDATE customers SET archived_at = ? WHERE id = ?")
			.params(Timestamp.from(archivedAt), customerId)
			.update();
	}

	/** Ticket sin responsable ni mensajes, insertado directamente; {@code status} en formato de la API. */
	public UUID ticket(UUID organizationId, UUID customerId, long number, String status) {
		UUID id = Ids.newId();
		Timestamp now = Timestamp.from(Instant.parse("2026-10-01T12:00:00Z"));
		this.jdbc.sql("""
				INSERT INTO tickets (id, organization_id, number, subject, description, status, priority, channel,
				                     customer_id, created_at, updated_at)
				VALUES (?, ?, ?, ?, 'Detalle', ?, 'medium', 'web', ?, ?, ?)
				""")
			.params(id, organizationId, number, "Ticket " + number, status, customerId, now, now)
			.update();
		return id;
	}

	/** Usuario con acceso de cliente enlazado a un registro de cliente. Devuelve el id del usuario. */
	public UUID customerUser(UUID organizationId, UUID customerId, String name, String email) {
		UUID userId = user(name, email);
		this.jdbc
			.sql("INSERT INTO memberships (id, organization_id, user_id, role, customer_id) VALUES (?, ?, ?, 'customer', ?)")
			.params(Ids.newId(), organizationId, userId, customerId)
			.update();
		return userId;
	}

}
