package com.resolve.api.organizations;

import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Si PostgreSQL conoce el nombre de zona tal cual: las consultas de métricas e informes agrupan por día en la base de
 * datos, y Java acepta alias y desplazamientos ({@code UTC+5}) que PostgreSQL interpreta con otro signo. Lo comparten
 * el PATCH de los ajustes y la creación de una organización.
 */
public final class TimeZones {

	private TimeZones() {
	}

	public static boolean databaseKnows(JdbcClient jdbc, String name) {
		return jdbc.sql("SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = :name)")
			.param("name", name)
			.query(Boolean.class)
			.single();
	}

}
