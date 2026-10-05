package com.resolve.api.memberships;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.resolve.api.common.persistence.Ids;

/** Usuarios globales: una persona es un solo usuario aunque pertenezca a varias organizaciones. */
@Component
public class UserDirectory {

	private final JdbcClient jdbc;

	private final UserAccountRepository users;

	UserDirectory(JdbcClient jdbc, UserAccountRepository users) {
		this.jdbc = jdbc;
		this.users = users;
	}

	/**
	 * Devuelve el usuario con ese correo (sin distinguir mayúsculas) o lo crea con el nombre dado; un usuario que
	 * ya existe conserva el suyo. El alta es un {@code INSERT … ON CONFLICT DO NOTHING}: dos invitaciones
	 * simultáneas del mismo correo no abortan la transacción con una violación de unicidad.
	 */
	@Transactional
	public UserAccount findOrCreate(String name, String email) {
		this.jdbc.sql("INSERT INTO users (id, name, email) VALUES (?, ?, ?) ON CONFLICT (lower(email)) DO NOTHING")
			.params(Ids.newId(), name, email)
			.update();
		return this.users.findByEmailIgnoreCase(email).orElseThrow();
	}

}
