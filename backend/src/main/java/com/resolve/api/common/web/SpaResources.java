package com.resolve.api.common.web;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;

import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Sirve la aplicación web (el {@code dist} de Vite copiado en {@code static/}) desde la misma aplicación y el mismo
 * origen: sin CORS y con la cookie de sesión de la API sin {@code SameSite=None}.
 *
 * <ul>
 * <li>{@code /assets/**}: los archivos con hash en el nombre, con caché larga e inmutable. Uno que no existe es un
 * 404, no el {@code index.html}: un navegador con un {@code index.html} viejo pide scripts que ya no están y debe ver
 * el fallo.
 * <li>Todo lo demás: el archivo si existe y, si no, el {@code index.html} para que recargar una ruta de la aplicación
 * ({@code /tickets/1047}) funcione ({@link SpaResourceResolver}). Sin caché, para que un despliegue nuevo se vea al
 * recargar.
 * </ul>
 *
 * <p>
 * Spring Boot trae su propio manejador de {@code /**}; se desactiva con {@code spring.web.resources.add-mappings=false}
 * para que este sea el único.
 */
@Configuration(proxyBeanMethods = false)
public class SpaResources implements WebMvcConfigurer {

	private static final String INDEX = "index.html";

	private final String location;

	SpaResources(@Value("${resolve.web.location:classpath:/static/}") String location) {
		this.location = location.endsWith("/") ? location : location + "/";
	}

	@Override
	public void addResourceHandlers(ResourceHandlerRegistry registry) {
		registry.addResourceHandler("/assets/**")
			.addResourceLocations(this.location + "assets/")
			.setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
		registry.addResourceHandler("/**")
			.addResourceLocations(this.location)
			.setCacheControl(CacheControl.noCache())
			// El jar fija la fecha de todos sus archivos (compilación reproducible: 1980-02-01), así que Last-Modified
			// no cambia entre despliegues y un navegador con el index.html viejo recibiría un 304. Se revalida por
			// contenido.
			.setUseLastModified(false)
			.setEtagGenerator(SpaResources::contentHash)
			// Sin caché de la cadena: resourceChain(true) guarda en un mapa sin límite cada ruta distinta que resuelve
			// al índice, y cualquiera puede pedir rutas distintas sin parar.
			.resourceChain(false)
			.addResolver(new SpaResourceResolver(INDEX));
	}

	private static @Nullable String contentHash(Resource resource) {
		try (InputStream content = resource.getInputStream()) {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content.readAllBytes()));
		}
		catch (IOException | NoSuchAlgorithmException exception) {
			// Sin ETag el navegador no revalida y vuelve a pedir el archivo entero: no es motivo para fallar.
			return null;
		}
	}

	/** La raíz no llega al manejador de recursos (la ruta vacía se descarta antes): se reenvía al índice. */
	@Override
	public void addViewControllers(ViewControllerRegistry registry) {
		registry.addViewController("/").setViewName("forward:/" + INDEX);
	}

}
