import { createBrowserRouter } from 'react-router'

// Las rutas de producto se añaden después de tokens, shell y componentes compartidos.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <main>Resolve</main>,
  },
])
