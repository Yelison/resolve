package com.resolve.api.common.web;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

import static org.assertj.core.api.Assertions.assertThat;

class SpaResourceResolverTest {

	private final SpaResourceResolver resolver = new SpaResourceResolver("index.html");

	@TempDir
	Path dist;

	private Resource location() throws IOException {
		Files.writeString(this.dist.resolve("index.html"), "<!doctype html><div id=root></div>");
		Files.writeString(this.dist.resolve("favicon.svg"), "<svg/>");
		return new FileSystemResource(this.dist.toString() + "/");
	}

	@Test
	void anExistingFileIsServedAsItIs() throws IOException {
		Resource resource = this.resolver.getResource("favicon.svg", location());

		assertThat(resource).isNotNull();
		assertThat(resource.getFilename()).isEqualTo("favicon.svg");
	}

	@Test
	void aRouteOfTheWebAppFallsBackToTheIndex() throws IOException {
		Resource location = location();

		assertThat(this.resolver.getResource("tickets/1047", location).getFilename()).isEqualTo("index.html");
		assertThat(this.resolver.getResource("conocimiento/recuperar-el-acceso-a-tu-cuenta", location).getFilename())
			.isEqualTo("index.html");
		assertThat(this.resolver.getResource("apice", location).getFilename()).isEqualTo("index.html");
	}

	@Test
	void whatDoesNotExistUnderTheServerPrefixesIsNotTheIndex() throws IOException {
		Resource location = location();

		assertThat(this.resolver.getResource("api", location)).isNull();
		assertThat(this.resolver.getResource("api/tickets/1", location)).isNull();
		assertThat(this.resolver.getResource("/api/nada", location)).isNull();
		assertThat(this.resolver.getResource("actuator", location)).isNull();
		assertThat(this.resolver.getResource("actuator/health", location)).isNull();
	}

	@Test
	void withoutAnIndexThereIsNoFallback() throws IOException {
		Resource location = new FileSystemResource(this.dist.toString() + "/");

		assertThat(this.resolver.getResource("tickets/1047", location)).isNull();
	}

}
