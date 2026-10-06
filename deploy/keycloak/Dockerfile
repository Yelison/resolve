# Keycloak de la demostración pública (D-14, Q-04): el proveedor de identidad que la API necesita en RESOLVE_OIDC_ISSUER.
# La imagen se construye desde la raíz del repositorio y la publica .github/workflows/deploy.yml en GHCR:
#
#   docker build -t resolve-idp:local -f deploy/keycloak/Dockerfile .
#
# Sin secretos en las capas: la base de datos (KC_DB_URL, KC_DB_USERNAME, KC_DB_PASSWORD),
# RESOLVE_OIDC_CLIENT_SECRET y RESOLVE_PUBLIC_URL se dan en tiempo de ejecución (docs/deploy/README.md).

# Keycloak 26.7.5, índice multiarquitectura fijado por digest (Dependabot, ecosistema docker, propone el siguiente).
FROM quay.io/keycloak/keycloak:26.7.5@sha256:37dbaf6f0722c9ec246335f36e1ef8b2e6cb960f7c27e0d8c615121a3d475a85 AS builder

# Sin superficie de administración: ni la consola ni la API REST de administración ni la consola de cuenta. El realm vive
# en el repositorio y se importa al arrancar; un cambio de urgencia se hace en el realm y se redespliega (docs/deploy).
# Las opciones de construcción (base de datos, health, features) se fijan aquí: con `start --optimized` ya no se pueden cambiar.
ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=false \
    KC_FEATURES_DISABLED=admin,admin-api,client-admin-api,account,account-api

COPY deploy/keycloak/themes /opt/keycloak/themes
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.7.5@sha256:37dbaf6f0722c9ec246335f36e1ef8b2e6cb960f7c27e0d8c615121a3d475a85

COPY --from=builder /opt/keycloak/ /opt/keycloak/
# --import-realm solo crea el realm si no existe (estrategia por defecto IGNORE_EXISTING): un reinicio o un nuevo
# despliegue no pisa lo que se haya cambiado después en Keycloak. Las ${...} del archivo se sustituyen desde el entorno.
COPY deploy/keycloak/resolve-realm.prod.json /opt/keycloak/data/import/resolve-realm.json

ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=false \
    KC_FEATURES_DISABLED=admin,admin-api,client-admin-api,account,account-api

# Keycloak no falla con una ${VARIABLE} sin valor del realm: deja el texto literal. El script exige las variables.
COPY --chmod=0555 deploy/keycloak/entrypoint.sh /opt/keycloak/bin/resolve-entrypoint.sh

# El usuario de la imagen oficial (1000), sin privilegios de root.
USER 1000

# La imagen no trae curl: se consulta el puerto de gestión (9000) con un socket de bash.
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
    CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/9000 && printf 'GET /health/ready HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && grep -q '\"status\": \"UP\"' <&3"]

EXPOSE 8080
ENTRYPOINT ["/opt/keycloak/bin/resolve-entrypoint.sh"]
CMD ["start", "--optimized", "--import-realm"]
