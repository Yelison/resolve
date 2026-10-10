import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { setDemoUser } from './api/client'
import { clearCacheOnDemoUserChange, queryClient } from './lib/queryClient'
import { AppProviders } from './app/AppProviders'
import { router } from './app/router'
import './styles/global.css'

// El usuario de demostración solo existe en desarrollo: se elige desde la consola con `setDemoUser(email)`.
if (import.meta.env.DEV) {
  clearCacheOnDemoUserChange(queryClient)
  Object.assign(window, { setDemoUser })
}

// Demostración estática (`vite build --mode showcase`): `/api` lo atiende el navegador con la API simulada de los e2e. Se
// instala antes de pintar; en cualquier otro modo esta rama desaparece del build y no deja ni el módulo ni los datos.
if (import.meta.env.MODE === 'showcase') {
  const { installShowcase } = await import('./showcase/install')
  installShowcase()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
