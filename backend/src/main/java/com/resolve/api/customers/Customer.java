package com.resolve.api.customers;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import com.resolve.api.common.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.DynamicUpdate;
import org.jspecify.annotations.Nullable;

/** Persona o empresa atendida por la organización. */
@Entity
@Table(name = "customers")
@DynamicUpdate
public class Customer extends AssignedIdEntity {

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

	Customer(UUID id, UUID organizationId, String name, String email, @Nullable String company, @Nullable String notes,
			Instant now) {
		super(id);
		this.organizationId = organizationId;
		this.name = name;
		this.email = email;
		this.company = company;
		this.notes = notes;
		this.createdAt = now;
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

	/**
	 * Aplica los datos de contacto y las notas ya validados; solo toca los campos que cambian, así un cambio vacío
	 * no marca la entidad como modificada y no sube la versión.
	 * @return si algún campo cambió
	 */
	boolean edit(String name, String email, @Nullable String company, @Nullable String notes) {
		boolean changed = false;
		if (!this.name.equals(name)) {
			this.name = name;
			changed = true;
		}
		if (!this.email.equals(email)) {
			this.email = email;
			changed = true;
		}
		if (!Objects.equals(this.company, company)) {
			this.company = company;
			changed = true;
		}
		if (!Objects.equals(this.notes, notes)) {
			this.notes = notes;
			changed = true;
		}
		return changed;
	}

	/** @return {@code false} si ya estaba archivado */
	boolean archive(Instant now) {
		if (this.archivedAt != null) {
			return false;
		}
		this.archivedAt = now;
		return true;
	}

	/** @return {@code false} si no estaba archivado */
	boolean restore() {
		if (this.archivedAt == null) {
			return false;
		}
		this.archivedAt = null;
		return true;
	}

}
