package com.resolve.api.support;

import ch.qos.logback.classic.LoggerContext;
import org.slf4j.LoggerFactory;
import org.springframework.boot.logging.LoggingInitializationContext;
import org.springframework.boot.logging.LoggingSystem;
import org.springframework.core.Ordered;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.test.context.TestContext;
import org.springframework.test.context.support.AbstractTestExecutionListener;

/**
 * El sistema de registro es estático en la JVM: un contexto con el perfil {@code prod} deja la consola en ECS
 * ({@code logging.structured.format.console=ecs}) para todas las clases de test que vengan después, y que un test vea
 * texto o JSON dependería del orden. Al terminar una clase cuyo contexto fijó un formato estructurado, esto vuelve a
 * inicializar el registro con el entorno vacío y sin las propiedades del sistema que Spring Boot dejó, es decir, con el formato por defecto.
 */
public class RestoreLoggingFormatListener extends AbstractTestExecutionListener {

	private static final String CONSOLE_FORMAT = "logging.structured.format.console";

	@Override
	public int getOrder() {
		return Ordered.LOWEST_PRECEDENCE;
	}

	@Override
	public void afterTestClass(TestContext testContext) {
		// hasApplicationContext: una clase sin contexto de Spring no tiene nada que restaurar y no debe arrancar uno.
		if (testContext.hasApplicationContext()
				&& testContext.getApplicationContext().getEnvironment().getProperty(CONSOLE_FORMAT) != null) {
			restoreDefaultFormat(testContext.getApplicationContext().getClassLoader());
		}
	}

	/** Visible para el test que comprueba que el arreglo hace falta. */
	public static void restoreDefaultFormat(ClassLoader classLoader) {
		// Spring Boot vuelca el formato a propiedades del sistema, y es ahí donde se queda para el resto de la JVM.
		System.clearProperty("CONSOLE_LOG_STRUCTURED_FORMAT");
		System.clearProperty("FILE_LOG_STRUCTURED_FORMAT");
		LoggingSystem system = LoggingSystem.get(classLoader);
		// Logback no reinicializa un contexto ya inicializado por Spring: se vacía antes para que lea el entorno vacío.
		((LoggerContext) LoggerFactory.getILoggerFactory()).reset();
		system.beforeInitialize();
		system.initialize(new LoggingInitializationContext(new StandardEnvironment()), null, null);
	}

}
