import type { SVGProps } from 'react'
import { iconPaths, type IconName } from './paths'

export type { IconName }

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'name'> {
  name: IconName
  /** Tamaño en px. El trazo mantiene 1,7 px en cualquier tamaño, como en Figma. */
  size?: number
  /** Texto accesible. Sin él, el icono es decorativo y se oculta a lectores de pantalla. */
  label?: string
}

export function Icon({ name, size = 20, label, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...props}
    >
      {iconPaths[name].map((d) => (
        <path key={d} d={d} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}
