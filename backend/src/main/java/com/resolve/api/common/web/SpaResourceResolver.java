package com.resolve.api.common.web;

import java.io.IOException;
import java.util.List;

import org.jspecify.annotations.Nullable;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * Devuelve el archivo pedido y, si no existe, el índice de la aplicación web para que sea ella quien decida qué
 * pantalla mostrar. Las rutas del servidor ({@code api/} y {@code actuator/}) nunca caen al índice: lo que no existe
 * ahí es un 404, no una página HTML que un cliente de la API intentaría leer como JSON. Si no hay índice (la
 * aplicación se arrancó sin el frontend copiado) tampoco hay respaldo y la respuesta es un 404.
 */
final class SpaResourceResolver extends PathResourceResolver {

	private static final List<String> SERVER_PREFIXES = List.of("api", "actuator");

	private final String index;

	SpaResourceResolver(String index) {
		this.index = index;
	}

	@Override
	protected @Nullable Resource getResource(String resourcePath, Resource location) throws IOException {
		Resource requested = super.getResource(resourcePath, location);
		if (requested != null || belongsToTheServer(resourcePath)) {
			return requested;
		}
		Resource fallback = location.createRelative(this.index);
		return (fallback.exists() && fallback.isReadable()) ? fallback : null;
	}

	/** Por segmento: {@code api} y {@code api/…} sí, {@code apice} no. */
	private static boolean belongsToTheServer(String resourcePath) {
		String path = resourcePath.startsWith("/") ? resourcePath.substring(1) : resourcePath;
		return SERVER_PREFIXES.stream().anyMatch((prefix) -> path.equals(prefix) || path.startsWith(prefix + "/"));
	}

}
