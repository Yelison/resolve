package com.resolve.api;

import org.springframework.boot.SpringApplication;

public class TestResolveApiApplication {

	public static void main(String[] args) {
		SpringApplication.from(ResolveApiApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
