package com.resolve.api.common.web;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.HandlerTypePredicate;
import org.springframework.web.servlet.config.annotation.PathMatchConfigurer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Todos los controladores de la API cuelgan de {@value #PATH}. El prefijo se añade aquí y no con
 * {@code server.servlet.context-path}, para que la misma aplicación sirva también la aplicación web desde la raíz
 * (mismo origen, sin CORS) y {@code /actuator} u otras rutas no tengan que vivir bajo un contexto.
 *
 * <p>
 * Se prefijan los controladores de {@code com.resolve.api} y de sus subpaquetes (el predicado reúne criterios con «o»,
 * por eso es solo el paquete): ningún controlador de ese paquete debe servir páginas, porque también heredaría el
 * prefijo. Los de Spring Boot ({@code /error}) y los de actuator quedan fuera.
 */
@Configuration(proxyBeanMethods = false)
public class ApiPathPrefix implements WebMvcConfigurer {

	/** Prefijo de la API; la cadena de seguridad lo usa para sus reglas y la sesión para el Path de su cookie. */
	public static final String PATH = "/api";

	private static final String BASE_PACKAGE = "com.resolve.api";

	@Override
	public void configurePathMatch(PathMatchConfigurer configurer) {
		configurer.addPathPrefix(PATH, HandlerTypePredicate.forBasePackage(BASE_PACKAGE));
	}

	/** Anteponer el prefijo a una ruta de la API ({@code "/me"} → {@code "/api/me"}). */
	public static String of(String path) {
		return PATH + path;
	}

}
