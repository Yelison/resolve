/**
 * Tipos de dominio de la base de conocimiento. Se generan desde docs/api/openapi.yaml (`npm run api:types`), de modo
 * que frontend y backend comparten un único contrato.
 */
export type {
  Article,
  ArticleCreate,
  ArticlePage,
  ArticlePatch,
  ArticleStatus,
  ArticleSummary,
  ArticleVisibility,
  Category,
  CategoryCreate,
  CategoryRef,
} from '../api/schema'
