/**
 * Tipos de dominio de tickets. Se generan desde docs/api/openapi.yaml (`npm run api:types`), de modo que
 * frontend y backend comparten un único contrato.
 */
export type {
  Activity,
  Customer,
  MemberRef,
  Message,
  MessageVisibility,
  Ticket,
  TicketChannel,
  TicketMetrics,
  TicketPriority,
  TicketStatus,
  TicketSummary,
  TicketView,
} from '../api/schema'
export { ticketChannelValues, ticketPriorityValues, ticketStatusValues, ticketViewValues } from '../api/schema'
