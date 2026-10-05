package com.resolve.api.knowledge;

import com.fasterxml.jackson.annotation.JsonValue;
import com.resolve.api.common.persistence.WireEnum;
import com.resolve.api.common.persistence.WireEnumConverter;
import jakarta.persistence.Converter;

/** Quién puede leer un artículo publicado: solo el equipo o también los clientes. */
public enum ArticleVisibility implements WireEnum {

	INTERNAL("internal"),
	PUBLIC("public");

	private final String wireValue;

	ArticleVisibility(String wireValue) {
		this.wireValue = wireValue;
	}

	@Override
	@JsonValue
	public String wireValue() {
		return this.wireValue;
	}

	@Converter(autoApply = true)
	static class JpaConverter extends WireEnumConverter<ArticleVisibility> {

		JpaConverter() {
			super(ArticleVisibility.class);
		}

	}

}
