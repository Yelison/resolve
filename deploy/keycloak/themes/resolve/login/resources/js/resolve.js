/* Tres ajustes de accesibilidad y marca que las plantillas de Keycloak no dan y que no justifican copiarlas:
 *  - un campo con error apunta con aria-describedby al mensaje que Keycloak pinta debajo (`input-error-<campo>`), y
 *    los avisos de la página (`.pf-v5-c-alert`) se anuncian como alerta;
 *  - la página de información no repite su título como párrafo;
 *  - el favicon es el SVG de la aplicación (Keycloak solo sabe declarar un `favicon.ico`). */
;(() => {
  const script = document.currentScript
  const enhance = () => {
    for (const input of document.querySelectorAll('input[aria-invalid="true"]')) {
      if (document.getElementById(`input-error-${input.id}`))
        input.setAttribute('aria-describedby', `input-error-${input.id}`)
    }
    for (const alert of document.querySelectorAll('.pf-v5-c-alert')) alert.setAttribute('role', 'alert')
    // La página de información (info.ftl) pinta el mismo mensaje como título y como párrafo («Has cerrado sesión»);
    // el mensaje no puede ser distinto sin copiar la plantilla, así que se oculta el párrafo repetido.
    const title = document.getElementById('kc-page-title')
    const body = document.querySelector('#kc-info-message > .instruction')
    if (title && body && body.textContent.trim() === title.textContent.trim()) body.hidden = true
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
