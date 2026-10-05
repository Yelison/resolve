import type { ArticlePage, ArticleSummary, Category } from '../../domain/article'

export const category = (overrides: Partial<Category> = {}): Category => ({
  id: 'cat-acceso',
  name: 'Cuenta y acceso',
  slug: 'cuenta-y-acceso',
  description: 'Usuarios y seguridad',
  articles: 2,
  ...overrides,
})

export const articleSummary = (overrides: Partial<ArticleSummary> = {}): ArticleSummary => ({
  id: 'a-recuperar',
  slug: 'como-recuperar-el-acceso-a-tu-cuenta',
  title: 'Cómo recuperar el acceso a tu cuenta',
  category: { id: 'cat-acceso', name: 'Cuenta y acceso', slug: 'cuenta-y-acceso' },
  status: 'published',
  visibility: 'public',
  updatedAt: '2026-10-04T10:00:00Z',
  publishedAt: '2026-10-04T10:00:00Z',
  ...overrides,
})

export const articlePage = (items: ArticleSummary[], totalItems = items.length): ArticlePage => ({
  items,
  page: 0,
  size: 20,
  totalItems,
  totalPages: Math.ceil(totalItems / 20),
})
