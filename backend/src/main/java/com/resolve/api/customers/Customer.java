package com.resolve.api.customers;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.DynamicUpdate;
import org.jspecify.annotations.Nullable;

/** Persona o empresa atendida por la organización. */
@Entity
@Table(name = "customers")
@DynamicUpdate
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

	private @Nullable String notes;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "archived_at")
	private @Nullable Instant archivedAt;

	@Version
	private long version;

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

	public @Nullable String getNotes() {
		return this.notes;
	}

	public Instant getCreatedAt() {
		return this.createdAt;
	}

	public @Nullable Instant getArchivedAt() {
		return this.archivedAt;
	}

	public long getVersion() {
		return this.version;
	}

}
