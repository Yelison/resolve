import { useEffect, useRef } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { isApiError } from '../../api/client'
import { cx } from '../../lib/cx'
import { Alert, Button, EmptyState, Skeleton } from '../../components/ui'
import { DemoUserPicker } from './DemoUserPicker'
import { useMe } from './queries'
import styles from './session.module.css'
import { subscribeSessionMessages } from './sessionChannel'
import { LOGIN_PATH, navigation } from './sessionLifecycle'

/**
 * Pantalla de entrada (`/entrar`). Sin sesión ofrece entrar con el proveedor de identidad; con sesión vuelve al
 * resumen. Nunca redirige a una ruta con sesión caducada, así que no hay bucle con `SessionGate`.
 */
export function LoginPage() {
  const me = useMe()
  const [params] = useSearchParams()
  const heading = useRef<HTMLHeadingElement>(null)
  // La condición va escrita aquí (ver `api/client.ts`): así el build de producción elimina el selector entero.
  const demoLogin = import.meta.env.DEV || import.meta.env.MODE === 'smoke'
  const unauthenticated = !me.data && isApiError(me.error, 401)

  useEffect(() => {
    document.title = 'Entrar · Resolve'
  }, [])
  // Otra pestaña acaba de entrar: aquí se vuelve a comprobar la sesión (con ella, esta pantalla redirige al resumen).
  const { refetch } = me
  useEffect(() => subscribeSessionMessages((type) => type === 'signed-in' && void refetch()), [refetch])
  useEffect(() => {
    if (unauthenticated) heading.current?.focus({ preventScroll: true })
  }, [unauthenticated])

  if (me.data) return <Navigate to="/" replace />

  // Mientras se comprueba la sesión se pinta la tarjeta real, oculta, y encima el esqueleto: así la tarjeta ya tiene su
  // altura definitiva y nada se mueve al llegar la respuesta.
  const checking = !unauthenticated && !me.isError

  return (
    <main className={styles.login}>
      <div className={styles.card}>
        <p className={styles.brand} aria-hidden="true">
          resolve
        </p>
        {me.isError && !unauthenticated ? (
          <EmptyState
            kind="error"
            title="No pudimos comprobar tu sesión"
            description="Revisa tu conexión y vuelve a intentarlo."
            action={
              <Button
                variant="secondary"
                loading={me.isFetching}
                loadingLabel="Reintentando…"
                onClick={() => void me.refetch()}
              >
                Reintentar
              </Button>
            }
          />
        ) : (
          <div className={styles.entryFrame}>
            <div className={cx(styles.entry, checking && styles.checking)} inert={checking}>
              <h1 ref={heading} tabIndex={-1} className={styles.title}>
                Entra a Resolve
              </h1>
              <p className={styles.lead}>Usa tu cuenta para ver los tickets, clientes y reportes de tu organización.</p>
              {params.get('error') === 'oidc' && (
                // La clave remonta el aviso al terminar la comprobación para que el rol `alert` se anuncie entonces.
                <Alert
                  key={checking ? 'checking' : 'ready'}
                  tone="red"
                  live={!checking}
                  title="No pudimos iniciar sesión"
                >
                  El proveedor de identidad no completó la entrada. Inténtalo de nuevo.
                </Alert>
              )}
              <Button block onClick={() => navigation.assign(LOGIN_PATH)}>
                Entrar con tu cuenta
              </Button>
              {demoLogin && (
                <section className={styles.demo} aria-labelledby="demo-title">
                  <h2 id="demo-title" className={styles.demoTitle}>
                    Demostración
                  </h2>
                  <DemoUserPicker />
                </section>
              )}
            </div>
            {checking && (
              <div className={styles.checkingSkeleton}>
                <Skeleton lines={3} label="Comprobando tu sesión…" />
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
