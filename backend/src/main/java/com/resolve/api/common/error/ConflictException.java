package com.resolve.api.common.error;

import org.jspecify.annotations.Nullable;

/**
 * La acción no está permitida en el estado actual del recurso (409): archivar dos veces, editar un archivado… Un
 * conflicto que el cliente debe distinguir sin leer el texto lleva además su {@link ProblemTypes tipo}.
 */
public class ConflictException extends RuntimeException {

	private final @Nullable String type;

	public ConflictException(String message) {
		this(message, null);
	}

	public ConflictException(String message, @Nullable String type) {
		super(message);
		this.type = type;
	}

	/** Valor del {@code type} del Problem, o {@code null} para {@code about:blank}. */
	public @Nullable String type() {
		return this.type;
	}

}
