package com.resolve.api.support;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.networknt.schema.Error;
import com.networknt.schema.Schema;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SpecificationVersion;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultMatcher;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.dataformat.yaml.YAMLMapper;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Valida las respuestas de MockMvc contra docs/api/openapi.yaml: el estado debe estar declarado en la operación y
 * el cuerpo debe cumplir su esquema. Los esquemas de respuesta no admiten campos extra, así que cualquier dato de más
 * (una entidad expuesta o una nota interna) hace fallar el test.
 */
public final class OpenApiContract {

	private static final JsonNode SPEC = load();

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final SchemaRegistry REGISTRY = SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12);

	private static final Map<String, Schema> SCHEMAS = new ConcurrentHashMap<>();

	private OpenApiContract() {
	}

	/** Matcher de MockMvc: {@code .andExpect(matchesContract("getTicket"))}. */
	public static ResultMatcher matchesContract(String operationId) {
		return (result) -> assertMatches(operationId, result);
	}

	public static void assertMatches(String operationId, MvcResult result) throws IOException {
		MockHttpServletResponse response = result.getResponse();
		String status = String.valueOf(response.getStatus());
		JsonNode responses = operation(operationId).path("responses");
		JsonNode declared = responses.path(status);
		assertThat(declared.isMissingNode()).as("%s no declara la respuesta %s", operationId, status).isFalse();
		JsonNode resolved = resolve(declared);
		JsonNode content = resolved.path("content");
		if (content.isMissingNode() || content.isEmpty()) {
			assertThat(response.getContentAsString()).as("%s %s no debería tener cuerpo", operationId, status).isEmpty();
			return;
		}
		String mediaType = baseMediaType(response.getContentType());
		assertThat(content.has(mediaType)).as("%s %s declara %s, no %s", operationId, status, content.propertyNames(),
				mediaType)
			.isTrue();
		Schema schema = SCHEMAS.computeIfAbsent(operationId + " " + status + " " + mediaType,
				(key) -> compile(content.path(mediaType).path("schema")));
		JsonNode body = JSON.readTree(response.getContentAsByteArray());
		List<Error> errors = schema.validate(body);
		assertThat(errors).as("%s %s no cumple el contrato:%n%s", operationId, status, body.toPrettyString()).isEmpty();
	}

	private static JsonNode operation(String operationId) {
		List<String> methods = List.of("get", "post", "put", "patch", "delete");
		for (JsonNode path : SPEC.path("paths")) {
			for (String method : methods) {
				JsonNode operation = path.path(method);
				if (operationId.equals(operation.path("operationId").asString(""))) {
					return operation;
				}
			}
		}
		throw new IllegalArgumentException("Operación desconocida en el contrato: " + operationId);
	}

	private static JsonNode resolve(JsonNode node) {
		String ref = node.path("$ref").asString("");
		if (ref.isEmpty()) {
			return node;
		}
		return SPEC.at(ref.substring(1));
	}

	/** Envuelve el esquema con los componentes del contrato para que resuelva sus {@code $ref}. */
	private static Schema compile(JsonNode schema) {
		ObjectNode root = JSON.createObjectNode();
		root.put("$schema", "https://json-schema.org/draft/2020-12/schema");
		root.set("components", SPEC.path("components"));
		root.putArray("allOf").add(schema);
		return REGISTRY.getSchema(root);
	}

	private static String baseMediaType(String contentType) {
		return (contentType != null) ? contentType.split(";")[0].trim() : "";
	}

	private static JsonNode load() {
		try (InputStream stream = OpenApiContract.class.getResourceAsStream("/openapi.yaml")) {
			if (stream == null) {
				throw new IllegalStateException("openapi.yaml no está en el classpath de test (ver testResources en pom.xml)");
			}
			return YAMLMapper.builder().build().readTree(stream);
		}
		catch (IOException exception) {
			throw new UncheckedIOException(exception);
		}
	}

	/** Operaciones del contrato, para comprobar que los tests cubren todas. */
	public static List<String> operationIds() {
		List<String> ids = new ArrayList<>();
		SPEC.path("paths").forEach((path) -> path.forEach((operation) -> {
			if (operation.has("operationId")) {
				ids.add(operation.path("operationId").asString());
			}
		}));
		return ids;
	}

}
