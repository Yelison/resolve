package com.resolve.api.memberships;

import java.util.UUID;

/** Personal activo (administradores y agentes) de una organización. */
public record StaffCount(UUID organizationId, long count) {
}
