package com.resolve.api.organizations;

import java.time.ZoneId;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.DynamicUpdate;
import org.jspecify.annotations.Nullable;

/** Empresa que usa Resolve. Todos los datos de negocio cuelgan de una organización. */
@Entity
@Table(name = "organizations")
@DynamicUpdate
public class Organization {

	@Id
	private UUID id;

	@Column(nullable = false)
	private String name;

	@Column(name = "time_zone", nullable = false)
	private String timeZone;

	@Column(name = "first_response_target_minutes", nullable = false)
	private int firstResponseTargetMinutes;

	@Column(name = "support_email")
	private @Nullable String supportEmail;

	@Version
	private long version;

	protected Organization() {
	}

	public UUID getId() {
		return this.id;
	}

	public String getName() {
		return this.name;
	}

	public String getTimeZone() {
		return this.timeZone;
	}

	public ZoneId zone() {
		return ZoneId.of(this.timeZone);
	}

	public int getFirstResponseTargetMinutes() {
		return this.firstResponseTargetMinutes;
	}

	public @Nullable String getSupportEmail() {
		return this.supportEmail;
	}

	public long getVersion() {
		return this.version;
	}

}
