package com.resolve.api.common.persistence;

import java.util.UUID;

import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Transient;
import org.springframework.data.domain.Persistable;

/**
 * Entidad con id generado en la aplicación. Implementa {@link Persistable} para que guardar una entidad nueva sea
 * un INSERT directo, sin el SELECT previo que haría Spring Data al ver un id ya asignado.
 */
@MappedSuperclass
public abstract class AssignedIdEntity implements Persistable<UUID> {

	@Id
	private UUID id;

	@Transient
	private boolean isNew;

	protected AssignedIdEntity() {
	}

	protected AssignedIdEntity(UUID id) {
		this.id = id;
		this.isNew = true;
	}

	@Override
	public UUID getId() {
		return this.id;
	}

	@Override
	public boolean isNew() {
		return this.isNew;
	}

	@PostLoad
	@PostPersist
	void markNotNew() {
		this.isNew = false;
	}

}
