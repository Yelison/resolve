import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { setDemoUser } from './api/client'
import { ToastProvider } from './components/ui'
import { clearCacheOnDemoUserChange, queryClient } from './lib/queryClient'
import { router } from './app/router'
import './styles/global.css'

// El usuario de demostración solo existe en desarrollo: se elige desde la consola con `setDemoUser(email)`.
if (import.meta.env.DEV) {
  clearCacheOnDemoUserChange(queryClient)
  Object.assign(window, { setDemoUser })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
