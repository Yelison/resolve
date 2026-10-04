package com.resolve.api.customers;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.jspecify.annotations.Nullable;

/** Persona o empresa atendida por la organización. */
@Entity
@Table(name = "customers")
public class Customer {

	@Id
	private UUID id;

	@Column(name = "organization_id", nullable = false)
	private UUID organizationId;

	@Column(nullable = false)
	private String name;

	@Column(nullable = false)
	private String email;

	private @Nullable String company;

	protected Customer() {
	}

	public UUID getId() {
		return this.id;
	}

	public UUID getOrganizationId() {
		return this.organizationId;
	}

	public String getName() {
		return this.name;
	}

	public String getEmail() {
		return this.email;
	}

	public @Nullable String getCompany() {
		return this.company;
	}

}
