import { createBrowserRouter } from 'react-router'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <main>Resolve</main>,
  },
  {
    path: '/catalogo',
    lazy: async () => ({ Component: (await import('./catalog/CatalogPage')).default }),
  },
])
