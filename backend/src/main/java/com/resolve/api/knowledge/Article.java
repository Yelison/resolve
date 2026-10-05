package com.resolve.api.knowledge;

import java.time.Instant;
import java.util.UUID;

import com.resolve.api.common.persistence.AssignedIdEntity;
import com.resolve.api.memberships.UserAccount;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.hibernate.annotations.DynamicUpdate;
import org.jspecify.annotations.Nullable;

/**
 * Artículo en Markdown. El cuerpo es texto: ni la entidad ni la API lo interpretan. Los mutadores solo tocan los
 * campos que cambian y devuelven si algo cambió, así un cambio vacío no sube la versión ni cambia quién editó.
 */
@Entity
@Table(name = "articles")
@DynamicUpdate
public class Article extends AssignedIdEntity {

	@Column(name = "organization_id", nullable = false, updatable = false)
	private UUID organizationId;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "category_id")
	private Category category;

	@Column(nullable = false, updatable = false)
	private String slug;

	@Column(nullable = false)
	private String title;

	@Column(nullable = false)
	private String body;

	@Column(nullable = false)
	private ArticleStatus status;

	@Column(nullable = false)
	private ArticleVisibility visibility;

	@Column(name = "allow_feedback", nullable = false)
	private boolean allowFeedback;

	@Version
	private long version;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "created_by", updatable = false)
	private UserAccount createdBy;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "updated_by")
	private UserAccount updatedBy;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Column(name = "published_at")
	private @Nullable Instant publishedAt;

	protected Article() {
	}

	/** Un artículo nuevo siempre empieza como borrador. */
	Article(UUID id, UUID organizationId, Category category, String slug, String title, String body,
			ArticleVisibility visibility, boolean allowFeedback, UserAccount author, Instant now) {
		super(id);
		this.organizationId = organizationId;
		this.category = category;
		this.slug = slug;
		this.title = title;
		this.body = body;
		this.status = ArticleStatus.DRAFT;
		this.visibility = visibility;
		this.allowFeedback = allowFeedback;
		this.createdBy = author;
		this.updatedBy = author;
		this.createdAt = now;
		this.updatedAt = now;
	}

	public UUID getOrganizationId() {
		return this.organizationId;
	}

	public Category getCategory() {
		return this.category;
	}

	public String getSlug() {
		return this.slug;
	}

	public String getTitle() {
		return this.title;
	}

	public String getBody() {
		return this.body;
	}

	public ArticleStatus getStatus() {
		return this.status;
	}

	public ArticleVisibility getVisibility() {
		return this.visibility;
	}

	public boolean isAllowFeedback() {
		return this.allowFeedback;
	}

	public long getVersion() {
		return this.version;
	}

	public UserAccount getCreatedBy() {
		return this.createdBy;
	}

	public UserAccount getUpdatedBy() {
		return this.updatedBy;
	}

	public Instant getCreatedAt() {
		return this.createdAt;
	}

	public Instant getUpdatedAt() {
		return this.updatedAt;
	}

	public @Nullable Instant getPublishedAt() {
		return this.publishedAt;
	}

	/**
	 * Aplica los campos ya validados. Si alguno cambia, anota quién y cuándo editó; si no, no toca nada.
	 * @return si algún campo cambió
	 */
	boolean edit(String title, String body, Category category, ArticleVisibility visibility, boolean allowFeedback,
			UserAccount editor, Instant now) {
		boolean changed = false;
		if (!this.title.equals(title)) {
			this.title = title;
			changed = true;
		}
		if (!this.body.equals(body)) {
			this.body = body;
			changed = true;
		}
		if (!this.category.getId().equals(category.getId())) {
			this.category = category;
			changed = true;
		}
		if (this.visibility != visibility) {
			this.visibility = visibility;
			changed = true;
		}
		if (this.allowFeedback != allowFeedback) {
			this.allowFeedback = allowFeedback;
			changed = true;
		}
		if (changed) {
			touch(editor, now);
		}
		return changed;
	}

	/** @return {@code false} si ya estaba publicado */
	boolean publish(UserAccount editor, Instant now) {
		if (this.status == ArticleStatus.PUBLISHED) {
			return false;
		}
		this.status = ArticleStatus.PUBLISHED;
		this.publishedAt = now;
		touch(editor, now);
		return true;
	}

	/** @return {@code false} si ya era un borrador */
	boolean unpublish(UserAccount editor, Instant now) {
		if (this.status == ArticleStatus.DRAFT) {
			return false;
		}
		this.status = ArticleStatus.DRAFT;
		this.publishedAt = null;
		touch(editor, now);
		return true;
	}

	private void touch(UserAccount editor, Instant now) {
		this.updatedBy = editor;
		this.updatedAt = now;
	}

}
