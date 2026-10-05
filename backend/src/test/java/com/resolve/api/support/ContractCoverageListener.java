package com.resolve.api.support;

import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.platform.engine.support.descriptor.ClassSource;
import org.junit.platform.launcher.LauncherSession;
import org.junit.platform.launcher.LauncherSessionListener;
import org.junit.platform.launcher.TestExecutionListener;
import org.junit.platform.launcher.TestIdentifier;
import org.junit.platform.launcher.TestPlan;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AssignableTypeFilter;

/**
 * Hace fallar la ejecución si alguna operación de docs/api/openapi.yaml no pasó por
 * {@link OpenApiContract#matchesContract(String)}. Solo actúa cuando la sesión ejecutó todas las clases concretas
 * que heredan de {@link ApiIntegrationTest}: una ejecución parcial ({@code -Dtest=...}) no comprueba la cobertura.
 *
 * <p>
 * La excepción se lanza al cerrar la sesión y no desde el {@link TestExecutionListener}, porque el launcher captura
 * las excepciones de sus listeners y solo las registra. Con varias JVM de Surefire ({@code forkCount > 1}) ninguna ve
 * la suite completa y la comprobación no se activa.
 */
public class ContractCoverageListener implements LauncherSessionListener {

	private static final String BASE_PACKAGE = "com.resolve";

	/** Clases de test ejecutadas en la sesión, sumando todos los planes que lance el launcher. */
	private final Set<String> executedClasses = ConcurrentHashMap.newKeySet();

	@Override
	public void launcherSessionOpened(LauncherSession session) {
		session.getLauncher().registerTestExecutionListeners(new TestExecutionListener() {

			@Override
			public void testPlanExecutionStarted(TestPlan testPlan) {
				for (TestIdentifier root : testPlan.getRoots()) {
					for (TestIdentifier identifier : testPlan.getDescendants(root)) {
						identifier.getSource()
							.filter(ClassSource.class::isInstance)
							.map((source) -> ((ClassSource) source).getClassName())
							.ifPresent(ContractCoverageListener.this.executedClasses::add);
					}
				}
			}

		});
	}

	@Override
	public void launcherSessionClosed(LauncherSession session) {
		Set<String> apiTests = apiTestClasses();
		if (apiTests.isEmpty()) {
			throw new IllegalStateException(
					"No se encontró ninguna subclase de ApiIntegrationTest en " + BASE_PACKAGE + ": revisa el escaneo");
		}
		if (!this.executedClasses.containsAll(apiTests)) {
			return;
		}
		List<String> operations = OpenApiContract.operationIds();
		List<String> missing = operations.stream()
			.filter((operationId) -> !OpenApiContract.verifiedOperationIds().contains(operationId))
			.toList();
		if (!missing.isEmpty()) {
			throw new IllegalStateException("Operaciones del contrato sin validar con matchesContract: " + missing);
		}
		System.out.printf("Cobertura del contrato: %d/%d operaciones validadas (%d clases de API)%n",
				operations.size(), operations.size(), apiTests.size());
	}

	/** Subclases concretas de {@link ApiIntegrationTest} en el classpath de test. */
	private static Set<String> apiTestClasses() {
		ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false);
		scanner.addIncludeFilter(new AssignableTypeFilter(ApiIntegrationTest.class));
		Set<String> classes = new TreeSet<>();
		for (BeanDefinition candidate : scanner.findCandidateComponents(BASE_PACKAGE)) {
			classes.add(candidate.getBeanClassName());
		}
		return classes;
	}

}
