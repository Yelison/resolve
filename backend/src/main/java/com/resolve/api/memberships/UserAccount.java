package com.resolve.api.memberships;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Persona que inicia sesión. Su papel en cada organización lo da la membresía. */
@Entity
@Table(name = "users")
public class UserAccount {

	@Id
	private UUID id;

	@Column(nullable = false)
	private String name;

	@Column(nullable = false)
	private String email;

	protected UserAccount() {
	}

	/** Cambia el nombre que se muestra; el correo identifica a la persona y no se edita. */
	void rename(String name) {
		this.name = name;
	}

	public UUID getId() {
		return this.id;
	}

	public String getName() {
		return this.name;
	}

	public String getEmail() {
		return this.email;
	}

}
