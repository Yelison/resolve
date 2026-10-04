package com.resolve.api.support;

import java.time.Instant;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@TestConfiguration(proxyBeanMethods = false)
public class TestClockConfiguration {

	/** 4 de octubre de 2026, 15:00 UTC (10:00 en Bogotá). */
	public static final Instant START = Instant.parse("2026-10-04T15:00:00Z");

	@Bean
	@Primary
	MutableClock testClock() {
		return new MutableClock(START);
	}

}
