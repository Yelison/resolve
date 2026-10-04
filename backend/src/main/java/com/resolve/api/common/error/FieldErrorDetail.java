package com.resolve.api.common.error;

/** Error de un campo concreto dentro de una respuesta de validación. */
public record FieldErrorDetail(String field, String message) {
}
