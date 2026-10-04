package com.resolve.api.common.persistence;

import jakarta.persistence.AttributeConverter;

/** Base de los convertidores JPA que guardan el valor de API de una {@link WireEnum}. */
public abstract class WireEnumConverter<E extends Enum<E> & WireEnum> implements AttributeConverter<E, String> {

	private final Class<E> type;

	protected WireEnumConverter(Class<E> type) {
		this.type = type;
	}

	@Override
	public String convertToDatabaseColumn(E value) {
		return (value != null) ? value.wireValue() : null;
	}

	@Override
	public E convertToEntityAttribute(String value) {
		if (value == null) {
			return null;
		}
		return WireEnum.fromWire(this.type, value)
			.orElseThrow(() -> new IllegalStateException("Valor desconocido para " + this.type.getSimpleName() + ": " + value));
	}

}
