import { useEffect, useRef, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router'
import { isApiError, PROBLEM_TYPES, readCsrfToken } from '../../api/client'
import { cx } from '../../lib/cx'
import { Alert, Button, EmptyState, Skeleton } from '../../components/ui'
import { Brand } from '../../components/ui/Sidebar/Brand'
import { DemoUserPicker } from './DemoUserPicker'
import { noMembershipNewcomer } from './newcomer'
import { NewcomerCard } from './NoWorkspaceCards'
import { ShowcaseLoginFrame } from './ShowcaseLoginFrame'
import { useMe } from './queries'
import styles from './session.module.css'
import { subscribeSessionMessages } from './sessionChannel'
import { LOGIN_PATH, navigation } from './sessionLifecycle'
import { useSessionActions } from './useSessionActions'

/**
 * Por qué el proveedor sí autenticó a la persona pero la aplicación no la admite, según el `type` del 401 (nunca por su
 * `detail`). Cualquier otro 401 (`about:blank`: sin sesión o sesión caducada) no es un rechazo y no lleva aviso. El texto
 * es de la interfaz, no del backend.
 */
const REFUSALS = new Map<string, string>([
  [
    PROBLEM_TYPES.accessDeactivated,
    'Tu acceso a este espacio fue desactivado. Pide a un administrador que lo restablezca o entra con otra cuenta.',
  ],
  [
    PROBLEM_TYPES.noMembership,
    'Esta cuenta no pertenece a ningún espacio de Resolve. Pide a un administrador que te invite o entra con otra cuenta.',
  ],
])

/**
 * Pantalla de entrada (`/entrar`). Sin sesión ofrece entrar con el proveedor de identidad; con sesión vuelve al
 * resumen. Nunca redirige a una ruta con sesión caducada, así que no hay bucle con `SessionGate`.
 */
export function LoginPage() {
  const me = useMe()
  const [params] = useSearchParams()
  const heading = useRef<HTMLHeadingElement>(null)
  // La condición va escrita aquí (ver `api/client.ts`): así el build de producción elimina el selector entero.
  const demoLogin = import.meta.env.DEV || import.meta.env.MODE === 'smoke' || import.meta.env.MODE === 'showcase'
  // En la demostración estática no hay proveedor de identidad al que salir: solo se ofrece el selector de usuarios.
  const providerLogin = import.meta.env.MODE !== 'showcase'
  // Releer una sesión que nunca cargó devuelve la consulta a «pending» y pierde el error: sin esto, el esqueleto sustituye a
  // la pantalla (y borra lo escrito en ella) cada vez que una relectura —p. ej. tras un 409— sigue en vuelo. Se conserva el
  // último hasta que llega otro.
  const [lastError, setLastError] = useState<unknown>(null)
  if (me.error && me.error !== lastError) setLastError(me.error)
  const error = me.error ?? lastError
  const unauthenticated = !me.data && isApiError(error, 401)
  const { signOut } = useSessionActions()
  // Motivo por el que el proveedor sí autenticó a la persona pero la aplicación no la admite.
  const type = isApiError(error, 401) ? error.problem.type : undefined
  const refusal = type ? REFUSALS.get(type) : undefined
  // Con una sesión OIDC en el servidor hay cookie de CSRF: se puede cerrar para entrar con otra cuenta.
  const canSignOut = refusal !== undefined && readCsrfToken() !== null
  // Quien no tiene ningún espacio y a quien el `401` dice quién es y si puede crear el suyo. Un servidor anterior no manda
  // el correo: ahí queda el aviso de siempre, en la pantalla de entrada.
  const newcomer = noMembershipNewcomer(error)
  const screen = newcomer ? (newcomer.canCreate ? 'create' : 'none') : 'entry'

  useEffect(() => {
    document.title =
      screen === 'create'
        ? 'Crea tu espacio · Resolve'
        : screen === 'none'
          ? 'Aún no estás en ningún espacio · Resolve'
          : 'Entrar · Resolve'
  }, [screen])
  // Otra pestaña acaba de entrar: aquí se vuelve a comprobar la sesión (con ella, esta pantalla redirige al resumen).
  const { refetch } = me
  useEffect(() => subscribeSessionMessages((type) => type === 'signed-in' && void refetch()), [refetch])
  // También cuando la pantalla cambia sola (la instalación cerró la creación entretanto): el foco sigue al título nuevo.
  useEffect(() => {
    if (unauthenticated) heading.current?.focus({ preventScroll: true })
  }, [unauthenticated, screen])

  if (me.data) return <Navigate to="/" replace />

  // Mientras se comprueba la sesión se pinta la tarjeta real, oculta, y encima el esqueleto: así la tarjeta ya tiene su
  // altura definitiva y nada se mueve al llegar la respuesta.
  const checking = !unauthenticated && !me.isError

  const page = (
    <main className={styles.login}>
      <div className={styles.card}>
        {/* Solo el logo: el título ya dice «Resolve», así que el nombre de la marca no se repite justo encima. Los títulos de quien llega sin espacio no lo dicen: ahí va con el nombre. */}
        <Brand showName={newcomer !== undefined} />
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
        ) : newcomer ? (
          // Con sesión OIDC (cookie de CSRF) se puede cerrar para entrar con otra cuenta.
          <NewcomerCard
            newcomer={newcomer}
            heading={heading}
            onSignOut={readCsrfToken() !== null ? () => signOut.mutate() : undefined}
            signingOut={signOut.isPending}
          />
        ) : (
          <div className={styles.entryFrame}>
            <div className={cx(styles.entry, checking && styles.checking)} inert={checking}>
              <h1 ref={heading} tabIndex={-1} className={styles.title}>
                Entra a Resolve
              </h1>
              <p className={styles.lead}>
                {providerLogin
                  ? 'Usa tu cuenta para ver los tickets, clientes y reportes de tu espacio.'
                  : 'Elige un usuario de demostración para ver los tickets, clientes y reportes de un espacio de ejemplo.'}
              </p>
              {params.get('error') === 'oidc' && (
                // La clave remonta el aviso al terminar la comprobación para que el rol `alert` se anuncie entonces.
                <Alert
                  key={checking ? 'checking' : 'ready'}
                  tone="red"
                  live={!checking}
                  title="No pudimos iniciar sesión"
                >
                  No pudimos completar el inicio de sesión. Inténtalo de nuevo.
                </Alert>
              )}
              {refusal && (
                <Alert
                  key={checking ? 'checking' : 'ready'}
                  tone="red"
                  live={!checking}
                  title="Esta cuenta no tiene acceso"
                >
                  {refusal}
                </Alert>
              )}
              {providerLogin && (
                <Button block onClick={() => navigation.assign(LOGIN_PATH)}>
                  Entrar con tu cuenta
                </Button>
              )}
              {canSignOut && (
                <Button
                  block
                  variant="secondary"
                  loading={signOut.isPending}
                  loadingLabel="Cerrando sesión…"
                  onClick={() => signOut.mutate()}
                >
                  Cerrar sesión y usar otra cuenta
                </Button>
              )}
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
  // La demostración estática avisa también aquí, fuera de la shell: es lo primero que se ve.
  return providerLogin ? page : <ShowcaseLoginFrame>{page}</ShowcaseLoginFrame>
}
