package com.resolve.api.knowledge;

import com.fasterxml.jackson.annotation.JsonValue;
import com.resolve.api.common.persistence.WireEnum;
import com.resolve.api.common.persistence.WireEnumConverter;
import jakarta.persistence.Converter;

/** Ciclo de vida de un artículo: un borrador solo lo ve el personal. */
public enum ArticleStatus implements WireEnum {

	DRAFT("draft"),
	PUBLISHED("published");

	private final String wireValue;

	ArticleStatus(String wireValue) {
		this.wireValue = wireValue;
	}

	@Override
	@JsonValue
	public String wireValue() {
		return this.wireValue;
	}

	@Converter(autoApply = true)
	static class JpaConverter extends WireEnumConverter<ArticleStatus> {

		JpaConverter() {
			super(ArticleStatus.class);
		}

	}

}
