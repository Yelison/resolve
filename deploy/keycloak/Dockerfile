# Keycloak de la demostración pública (D-14, Q-04): el proveedor de identidad que la API necesita en RESOLVE_OIDC_ISSUER.
# La imagen se construye desde la raíz del repositorio y la publica .github/workflows/deploy.yml en GHCR:
#
#   docker build -t resolve-idp:local -f deploy/keycloak/Dockerfile .
#
# Sin secretos en las capas: la base de datos (KC_DB_URL, KC_DB_USERNAME, KC_DB_PASSWORD),
# RESOLVE_OIDC_CLIENT_SECRET y RESOLVE_PUBLIC_URL se dan en tiempo de ejecución (docs/deploy/README.md).

# Keycloak 26.7.5, índice multiarquitectura fijado por digest (Dependabot, ecosistema docker, propone el siguiente).
FROM quay.io/keycloak/keycloak:26.8.0-1@sha256:27b3230fbabb8c9ff3c66c864cf09dcd8a41aca82e5100679d109ef0eeb05741 AS builder

# Sin superficie de administración: ni la consola ni la API REST de administración ni la consola de cuenta. El realm vive
# en el repositorio y se importa al arrancar; un cambio de urgencia se hace en el realm y se redespliega (docs/deploy).
# Una sola máquina (fly.toml): caché local, sin descubrimiento ni clúster de Infinispan por la base de datos.
# Las opciones de construcción (base de datos, health, features, caché) se fijan aquí: con `start --optimized` ya no se pueden cambiar.
ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=false \
    KC_CACHE=local \
    KC_FEATURES_DISABLED=admin,admin-api,client-admin-api,account,account-api

COPY deploy/keycloak/themes /opt/keycloak/themes
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:26.8.0-1@sha256:27b3230fbabb8c9ff3c66c864cf09dcd8a41aca82e5100679d109ef0eeb05741

COPY --from=builder /opt/keycloak/ /opt/keycloak/
# En Fly el realm lo aplica la release_command de fly.toml (`import --override true`) en cada despliegue. --import-realm,
# con la estrategia por defecto IGNORE_EXISTING, solo crea el realm si no existe: sirve para ejecutar la imagen fuera de Fly. Las ${...} del archivo se sustituyen desde el entorno.
COPY deploy/keycloak/resolve-realm.prod.json /opt/keycloak/data/import/resolve-realm.json

ENV KC_DB=postgres \
    KC_HEALTH_ENABLED=true \
    KC_METRICS_ENABLED=false \
    KC_CACHE=local \
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
