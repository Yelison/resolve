package com.resolve.api.customers;

import java.util.UUID;

import org.jspecify.annotations.Nullable;

public record CustomerDto(UUID id, String name, String email, @Nullable String company) {

	public static CustomerDto from(Customer customer) {
		return new CustomerDto(customer.getId(), customer.getName(), customer.getEmail(), customer.getCompany());
	}

}
