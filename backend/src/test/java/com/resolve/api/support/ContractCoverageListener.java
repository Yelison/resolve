package com.resolve.api.support;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.TestTemplate;
import org.junit.platform.commons.support.AnnotationSupport;
import org.junit.platform.commons.support.HierarchyTraversalMode;
import org.junit.platform.commons.support.ReflectionSupport;
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
 * que heredan de {@link ApiIntegrationTest}: una ejecución parcial ({@code -Dtest=...}) no comprueba la cobertura y lo
 * indica en la consola.
 *
 * <p>
 * Una clase de API que la suite no puede ejecutar dejaría la comprobación inactiva para siempre, así que la sesión
 * también falla cuando alguna no declara métodos de test de Jupiter o su nombre no encaja con los includes por
 * defecto de Surefire ({@code Test*}, {@code *Test}, {@code *Tests}, {@code *TestCase}, sin clases anidadas). Si se
 * configuran otros includes en el {@code pom.xml}, hay que reflejarlos aquí.
 *
 * <p>
 * La excepción se lanza al cerrar la sesión y no desde el {@link TestExecutionListener}, porque el launcher captura
 * las excepciones de sus listeners y solo las registra. Con varias JVM de Surefire ({@code forkCount > 1}) o con un
 * filtro por etiquetas, ninguna sesión ve la suite completa y la comprobación queda inactiva con el aviso de
 * ejecución parcial.
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
		List<String> unrunnable = apiTests.stream()
			.map(ContractCoverageListener::unrunnableReason)
			.filter((reason) -> !reason.isEmpty())
			.toList();
		if (!unrunnable.isEmpty()) {
			throw new IllegalStateException(
					"Clases de API que la suite no ejecuta y desactivarían la cobertura del contrato: " + unrunnable);
		}
		List<String> notExecuted = apiTests.stream()
			.filter((className) -> !this.executedClasses.contains(className))
			.map(ContractCoverageListener::simpleName)
			.toList();
		if (notExecuted.size() == apiTests.size()) {
			return;
		}
		if (!notExecuted.isEmpty()) {
			System.out.printf("Cobertura del contrato: no comprobada (faltan %d clases de API: %s)%n",
					notExecuted.size(), String.join(", ", notExecuted));
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

	/** Por qué Surefire y Jupiter no ejecutarían la clase, o una cadena vacía si la ejecutan. */
	private static String unrunnableReason(String className) {
		List<String> reasons = new ArrayList<>();
		String name = simpleName(className);
		if (className.contains("$")) {
			reasons.add("Surefire excluye las clases anidadas");
		}
		else if (!(name.startsWith("Test") || name.endsWith("Test") || name.endsWith("Tests")
				|| name.endsWith("TestCase"))) {
			reasons.add("el nombre no encaja con Test*, *Test, *Tests ni *TestCase");
		}
		Class<?> testClass = ReflectionSupport.tryToLoadClass(className)
			.getOrThrow((cause) -> new IllegalStateException("No se pudo cargar " + className, cause));
		if (!hasTests(testClass)) {
			reasons.add("no declara métodos de test de Jupiter");
		}
		return reasons.isEmpty() ? "" : name + " (" + String.join("; ", reasons) + ")";
	}

	private static boolean hasTests(Class<?> testClass) {
		boolean hasTestMethods = !ReflectionSupport
			.findMethods(testClass, ContractCoverageListener::isTestMethod, HierarchyTraversalMode.TOP_DOWN)
			.isEmpty();
		return hasTestMethods || ReflectionSupport
			.findNestedClasses(testClass, (nested) -> AnnotationSupport.isAnnotated(nested, Nested.class))
			.stream()
			.anyMatch(ContractCoverageListener::hasTests);
	}

	private static boolean isTestMethod(Method method) {
		return AnnotationSupport.isAnnotated(method, Test.class)
				|| AnnotationSupport.isAnnotated(method, TestTemplate.class)
				|| AnnotationSupport.isAnnotated(method, TestFactory.class);
	}

	private static String simpleName(String className) {
		return className.substring(className.lastIndexOf('.') + 1);
	}

}
