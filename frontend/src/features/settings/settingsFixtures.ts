import type { OrganizationSettings } from '../../api/schema'

/** Ajustes de organización con el contrato de `GET /organization`; `overrides` cambia lo que cada test necesita. */
export const organizationSettings = (overrides: Partial<OrganizationSettings> = {}): OrganizationSettings => ({
  id: 'org-1',
  name: 'Acme Studio',
  supportEmail: 'soporte@acme.example',
  timeZone: 'America/Bogota',
  firstResponseTargetMinutes: 30,
  version: 3,
  ...overrides,
})

/** Cabecera `ETag` que acompaña a una lectura de los ajustes. */
export const etag = (version: number) => ({ ETag: `"${version}"` })
