#!/bin/sh
# Rechaza el arranque si falta lo que el realm sustituye al importarse. Keycloak NO falla con una ${VARIABLE} sin valor por
# defecto: deja el texto literal, y el secreto del cliente sería la cadena pública «${RESOLVE_OIDC_CLIENT_SECRET}».
# La API hace lo mismo en prod (sin valores por defecto, la lista de las que faltan).
set -eu

missing=""
for name in RESOLVE_OIDC_CLIENT_SECRET RESOLVE_DEMO_USER_PASSWORD RESOLVE_PUBLIC_URL KC_DB_URL KC_DB_USERNAME KC_DB_PASSWORD KC_HOSTNAME; do
  eval "value=\${$name:-}"
  [ -n "$value" ] || missing="$missing $name"
done
if [ -n "$missing" ]; then
  echo "Missing required configuration, which has no defaults:$missing" >&2
  exit 1
fi

# Un secreto corto o con la forma de una sustitución sin resolver no es un secreto.
if [ "${#RESOLVE_OIDC_CLIENT_SECRET}" -lt 16 ]; then
  echo "RESOLVE_OIDC_CLIENT_SECRET must have at least 16 characters" >&2
  exit 1
fi

# La contraseña de los usuarios de la demo la elige el propietario y es pública a propósito, pero no es la del realm de
# desarrollo: el realm de producción no tiene valor por defecto y `demo` se rechaza aquí, también en el release_command.
if [ "$RESOLVE_DEMO_USER_PASSWORD" = "demo" ]; then
  echo "RESOLVE_DEMO_USER_PASSWORD must be chosen by the owner: 'demo' is the password of the development realm" >&2
  exit 1
fi

exec /opt/keycloak/bin/kc.sh "$@"
