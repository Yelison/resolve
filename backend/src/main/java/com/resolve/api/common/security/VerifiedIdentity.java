package com.resolve.api.common.security;

/**
 * Una identidad que el proveedor autenticó con correo verificado y que no tiene ninguna membresía: aún no es un miembro de
 * ninguna organización. {@code name} nunca está vacío (el del proveedor, el guardado o la parte local del correo).
 *
 * <p>
 * <b>Por qué es un atributo de la petición y no un {@code Authentication}.</b> Con {@code CurrentMember} como principal
 * toda la API da por hecho que quien llama tiene una organización y un rol; una {@code Authentication} autenticada de
 * «identidad sin espacio» pasaría cualquier regla {@code authenticated()} (por ejemplo la de {@code GET /me}) y llegaría a
 * controladores que esperan un {@code CurrentMember}. Como atributo ({@link PrincipalResolver#IDENTITY_ATTRIBUTE}) el
 * contexto de seguridad sigue vacío para esa persona, así que toda regla la trata como hasta ahora (un {@code 401} tipado
 * {@code no-membership}) y la única que la admite es la de {@code POST /organizations}, escrita a propósito en
 * {@code SecurityConfiguration}: ninguna regla nueva puede dejarla pasar por descuido.
 */
public record VerifiedIdentity(String email, String name) {
}
