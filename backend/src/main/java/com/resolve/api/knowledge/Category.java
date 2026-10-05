package com.resolve.api.knowledge;

import java.time.Instant;
import java.util.UUID;

import com.resolve.api.common.persistence.AssignedIdEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import org.jspecify.annotations.Nullable;

/** Agrupa los artículos de una organización. El slug sale del nombre al crearla y no cambia. */
@Entity
@Table(name = "knowledge_categories")
public class Category extends AssignedIdEntity {

	@Column(name = "organization_id", nullable = false, updatable = false)
	private UUID organizationId;

	@Column(nullable = false)
	private String name;

	@Column(nullable = false, updatable = false)
	private String slug;

	private @Nullable String description;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected Category() {
	}

	Category(UUID id, UUID organizationId, String name, String slug, @Nullable String description, Instant now) {
		super(id);
		this.organizationId = organizationId;
		this.name = name;
		this.slug = slug;
		this.description = description;
		this.createdAt = now;
	}

	public UUID getOrganizationId() {
		return this.organizationId;
	}

	public String getName() {
		return this.name;
	}

	public String getSlug() {
		return this.slug;
	}

	public @Nullable String getDescription() {
		return this.description;
	}

	public Instant getCreatedAt() {
		return this.createdAt;
	}

}
