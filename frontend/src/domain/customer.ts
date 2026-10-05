/**
 * Tipos de dominio de clientes. Se generan desde docs/api/openapi.yaml (`npm run api:types`), de modo que
 * frontend y backend comparten un único contrato.
 */
export type {
  Customer,
  CustomerCreate,
  CustomerDetail,
  CustomerMetrics,
  CustomerPage,
  CustomerPatch,
  CustomerSummary,
} from '../api/schema'
