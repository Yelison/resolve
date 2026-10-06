/* Dos ajustes de accesibilidad y marca que las plantillas de Keycloak no dan y que no justifican copiarlas:
 *  - un campo con error apunta con aria-describedby al mensaje que Keycloak pinta debajo (`input-error-<campo>`), y
 *    los avisos de la página (`.pf-v5-c-alert`) se anuncian como alerta;
 *  - el favicon es el SVG de la aplicación (Keycloak solo sabe declarar un `favicon.ico`). */
;(() => {
  const script = document.currentScript
  const enhance = () => {
    for (const input of document.querySelectorAll('input[aria-invalid="true"]')) {
      if (document.getElementById(`input-error-${input.id}`))
        input.setAttribute('aria-describedby', `input-error-${input.id}`)
    }
    for (const alert of document.querySelectorAll('.pf-v5-c-alert')) alert.setAttribute('role', 'alert')
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance)
  else enhance()

  if (script && script.src) {
    for (const link of document.querySelectorAll('link[rel~="icon"]')) link.remove()
    const icon = document.createElement('link')
    icon.rel = 'icon'
    icon.type = 'image/svg+xml'
    icon.href = new URL('../img/favicon.svg', script.src).href
    document.head.append(icon)
  }
})()
