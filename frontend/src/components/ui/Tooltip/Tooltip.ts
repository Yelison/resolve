// `Tooltip` vive en @yelison/forma-ui; esta carpeta lo reexporta para que `Sidebar`, `NavItem` y los gráficos sigan
// importándolo desde aquí (ADR 0002). El registro del tooltip activo, la posición y el cierre con Escape son del paquete.
export { Tooltip, type TooltipPlacement, type TooltipProps, type TooltipTriggerProps } from '@yelison/forma-ui'
