package com.resolve.api.common.persistence;

import java.util.Arrays;
import java.util.Optional;

/** Enumeraciones con un valor en minúsculas compartido por la API y la base de datos. */
public interface WireEnum {

	String wireValue();

	static <E extends Enum<E> & WireEnum> Optional<E> fromWire(Class<E> type, String value) {
		return Arrays.stream(type.getEnumConstants()).filter((constant) -> constant.wireValue().equals(value)).findFirst();
	}

}
