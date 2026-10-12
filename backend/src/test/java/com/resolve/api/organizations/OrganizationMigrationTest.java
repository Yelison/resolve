package com.resolve.api.organizations;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * La migración V10 sobre datos que ya existen, con el recorrido real de la demostración desplegada: V1 a V9 más los datos
 * de demostración V1000 a V1007 aplicados <i>antes</i> de que existiera V10, y después V10 y V1008 fuera de orden
 * ({@code SPRING_FLYWAY_OUT_OF_ORDER=true}, como en {@code deploy/fly.toml}). También el camino de una base nueva, donde V10
 * va antes que los datos de demostración. Sin Spring: una base propia por escenario en su propio contenedor.
 */
class OrganizationMigrationTest {

	private static final UUID ACME = UUID.fromString("0192f000-0000-7000-8000-000000000001");

	private static final UUID NORTHWIND = UUID.fromString("0192f000-0000-7000-8000-000000000002");

	private static final String DEMO = "classpath:db/demo";

	private static final String SCHEMA = "classpath:db/migration";

	private static Flyway flyway(String url, String target, boolean outOfOrder, String... locations) {
		return Flyway.configure()
			.dataSource(url, "test", "test")
			.locations(locations)
			.target(target)
			.outOfOrder(outOfOrder)
			.ignoreMigrationPatterns("*:missing")
			.load();
	}

	private static String scalar(Connection connection, String sql) throws SQLException {
		try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(sql)) {
			rows.next();
			return rows.getString(1);
		}
	}

	@Test
	void existingOrganizationsGetTheColorOfTheirIdAreMarkedAsEstablishedAndCountForNobody() throws Exception {
		try (PostgreSQLContainer postgres = new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"))
			.withUsername("test")
			.withPassword("test")) {
			postgres.start();
			String url = postgres.getJdbcUrl();

			// La base de demostración desplegada antes de V10: el esquema hasta V9 y los datos de demostración hasta V1007.
			flyway(url, "9", false, SCHEMA).migrate();
			UUID legacy = UUID.fromString("0192f000-0000-7000-8000-0000000000a7");
			try (Connection connection = DriverManager.getConnection(url, "test", "test");
					Statement statement = connection.createStatement()) {
				statement.execute("insert into organizations (id, name, time_zone) values ('" + legacy + "', 'Antigua', 'UTC')");
			}
			flyway(url, "1007", false, DEMO).migrate();

			// V10 y V1008 llegan después, fuera de orden.
			flyway(url, "latest", true, SCHEMA, DEMO).migrate();

			try (Connection connection = DriverManager.getConnection(url, "test", "test")) {
				for (UUID id : new UUID[] { ACME, NORTHWIND, legacy }) {
					assertThat(scalar(connection, "select color from organizations where id = '" + id + "'"))
						.as("color de " + id)
						.isEqualTo(OrganizationColors.forId(id));
					assertThat(scalar(connection,
							"select getting_started_done_at is not null from organizations where id = '" + id + "'"))
						.as("Primeros pasos completado en " + id)
						.isEqualTo("t");
				}
				assertThat(scalar(connection, "select count(*) from organizations where created_by is not null")).isEqualTo("0");
				assertThat(scalar(connection, "select count(*) from organizations")).isEqualTo("3");
				// Una organización nueva tras la migración empieza sin completar y con su color por el disparador.
				try (Statement statement = connection.createStatement()) {
					statement.execute("insert into organizations (id, name, time_zone) values ('" + UUID.nameUUIDFromBytes(new byte[] { 1 })
							+ "', 'Nueva', 'UTC')");
				}
				UUID fresh = UUID.nameUUIDFromBytes(new byte[] { 1 });
				assertThat(scalar(connection, "select color from organizations where id = '" + fresh + "'"))
					.isEqualTo(OrganizationColors.forId(fresh));
				assertThat(scalar(connection, "select getting_started_done_at is null from organizations where id = '" + fresh + "'"))
					.isEqualTo("t");
			}
		}
	}

	@Test
	void aFreshDatabaseWithTheDemoDataEndsWithColorsAndEstablishedDemoOrganizations() throws Exception {
		try (PostgreSQLContainer postgres = new PostgreSQLContainer(DockerImageName.parse("postgres:17-alpine"))
			.withUsername("test")
			.withPassword("test")) {
			postgres.start();
			String url = postgres.getJdbcUrl();

			// V10 va antes que V1000: los datos de demostración se insertan sin color y sin fecha.
			flyway(url, "latest", false, SCHEMA, DEMO).migrate();

			try (Connection connection = DriverManager.getConnection(url, "test", "test")) {
				for (UUID id : new UUID[] { ACME, NORTHWIND }) {
					assertThat(scalar(connection, "select color from organizations where id = '" + id + "'"))
						.isEqualTo(OrganizationColors.forId(id));
				}
				assertThat(scalar(connection, "select count(*) from organizations where getting_started_done_at is null"))
					.as("organizaciones de demostración sin marcar")
					.isEqualTo("0");
			}
		}
	}

}
