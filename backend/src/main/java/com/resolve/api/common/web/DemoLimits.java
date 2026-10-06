package com.resolve.api.common.web;

import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Los topes por organización de la demostración pública (plan §4.5-5): 500 tickets, 200 clientes, 50 miembros y 100
 * artículos. Es una comprobación de servicio que cada alta llama antes de guardar; solo actúa con
 * {@code resolve.demo.limits=true} (fuera de la demostración {@link #check} no hace nada ni consulta la base de datos).
 *
 * <p>
 * Qué cuenta: los tickets, los clientes (también los archivados) y los artículos (borradores y publicados) de la
 * organización; los miembros de personal (administradores y agentes) que no están retirados, invitados incluidos. Los
 * accesos de portal de los clientes no cuentan: los limita el tope de clientes.
 *
 * <p>
 * El tope es exacto con altas simultáneas: {@link #check} toma un bloqueo de asesoramiento de transacción
 * ({@code pg_advisory_xact_lock}) por recurso y organización antes de contar, y lo conserva hasta que termina la
 * transacción del alta. La segunda alta espera a que la primera confirme y entonces cuenta su fila. Por eso se exige
 * una transacción abierta ({@code MANDATORY}): sin ella el bloqueo se soltaría al instante. Todos los llamadores
 * (crear ticket, cliente, artículo e invitar miembro) son {@code @Transactional}.
 */
@Component
public class DemoLimits {

	/** Lo que se limita, con su tope por defecto y cómo se cuenta. */
	public enum Resource {

		TICKETS("tickets", 500, "tickets", "SELECT count(*) FROM tickets WHERE organization_id = ?"),
		CUSTOMERS("clientes", 200, "customers", "SELECT count(*) FROM customers WHERE organization_id = ?"),
		MEMBERS("miembros", 50, "members", """
				SELECT count(*) FROM memberships
				WHERE organization_id = ? AND role <> 'customer' AND status <> 'removed'
				"""),
		ARTICLES("artículos", 100, "articles", "SELECT count(*) FROM articles WHERE organization_id = ?");

		private final String label;

		private final int cap;

		private final String property;

		private final String count;

		Resource(String label, int cap, String property, String count) {
			this.label = label;
			this.cap = cap;
			this.property = property;
			this.count = count;
		}

	}

	private final JdbcClient jdbc;

	private final boolean enabled;

	private final int[] caps = new int[Resource.values().length];

	DemoLimits(JdbcClient jdbc, Environment environment,
			@Value("${resolve.demo.limits:false}") boolean enabled) {
		this.jdbc = jdbc;
		this.enabled = enabled;
		for (Resource resource : Resource.values()) {
			// El tope se puede bajar con resolve.demo.cap.<recurso> (los tests lo hacen para no sembrar 500 filas).
			this.caps[resource.ordinal()] = environment.getProperty("resolve.demo.cap." + resource.property,
					Integer.class, resource.cap);
		}
	}

	/** El tope vigente de un recurso. */
	public int cap(Resource resource) {
		return this.caps[resource.ordinal()];
	}

	/** Lanza {@link DemoLimitException} (409) si la organización ya tiene el máximo de ese recurso. */
	@Transactional(propagation = Propagation.MANDATORY)
	public void check(Resource resource, UUID organizationId) {
		if (!this.enabled) {
			return;
		}
		this.jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))")
			.param("demo-cap:" + resource.property + ":" + organizationId)
			.query()
			.singleRow();
		long current = this.jdbc.sql(resource.count).param(organizationId).query(Long.class).single();
		int cap = cap(resource);
		if (current >= cap) {
			throw new DemoLimitException("La demostración admite hasta " + cap + " " + resource.label
					+ " por organización. Los datos se reinician cada noche.");
		}
	}

}
