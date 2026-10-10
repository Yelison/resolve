// Primera línea, a propósito: las reglas del paquete (`.forma-*`) tienen que quedar antes que el CSS de cualquier
// componente de Resolve. Vite agrupa el CSS por chunk y enlaza el de este barrel (`ui-*.css`) antes que el del punto de
// entrada, así que importarlo desde `global.css` lo dejaría detrás. `e2e/production-bundle.spec.ts` lo comprueba en el build.
import '@yelison/forma-ui/styles.css'

export { Alert, type AlertProps, type AlertTone } from './Alert/Alert'
export { Attachment, type AttachmentProps, type AttachmentStatus } from './Attachment/Attachment'
export { Avatar, type AvatarProps, type AvatarSize } from './Avatar/Avatar'
export { Badge, type BadgeProps, type BadgeTone } from './Badge/Badge'
export {
  BarChart,
  type BarChartColor,
  type BarChartPoint,
  type BarChartProps,
  type BarChartSeries,
} from './BarChart/BarChart'
export { Breadcrumb, type BreadcrumbItem, type BreadcrumbProps } from './Breadcrumb/Breadcrumb'
export { Button, IconButton, type ButtonProps, type IconButtonProps } from './Button/Button'
export { buttonClassName, type ButtonVariant } from './Button/buttonClassName'
export { Checkbox, type CheckboxProps } from './Checkbox/Checkbox'
export { Combobox, type ComboboxOption, type ComboboxProps } from './Combobox/Combobox'
export { DonutChart, type DonutChartProps, type DonutColor, type DonutSegment } from './DonutChart/DonutChart'
export { DotPlot, type DotPlotProps, type DotPlotRow, type DotPlotTarget } from './DotPlot/DotPlot'
export { Editor, type EditorMode, type EditorProps, type EditorStatus } from './Editor/Editor'
export { EmptyState, type EmptyStateKind, type EmptyStateProps } from './EmptyState/EmptyState'
export { Field, type FieldControlProps, type FieldProps } from './Field/Field'
export { FilterChip, type FilterChipProps } from './FilterChip/FilterChip'
export { Heatmap, type HeatmapColumn, type HeatmapProps, type HeatmapRow } from './Heatmap/Heatmap'
export { Icon, type IconName, type IconProps } from './Icon/Icon'
export { Input, type InputProps } from './Input/Input'
export { LineChart, type LineChartPoint, type LineChartProps } from './LineChart/LineChart'
export { Menu, type MenuItem, type MenuProps, type MenuTriggerProps } from './Menu/Menu'
export { Message, type MessageKind, type MessageProps } from './Message/Message'
export { Metric, type MetricProps, type MetricTrend } from './Metric/Metric'
export { Modal, type ModalProps } from './Modal/Modal'
export { NavItem, type NavItemProps } from './NavItem/NavItem'
export { Pagination, type PaginationProps } from './Pagination/Pagination'
export { ProgressBar, type ProgressBarProps } from './ProgressBar/ProgressBar'
export { Radio, type RadioProps } from './Radio/Radio'
export { SearchField, type SearchFieldProps } from './SearchField/SearchField'
export { Select, type SelectProps } from './Select/Select'
export { Sidebar, type SidebarAction, type SidebarNavItem, type SidebarProps } from './Sidebar/Sidebar'
export { Skeleton, type SkeletonProps } from './Skeleton/Skeleton'
export { Sparkline, type SparklineProps } from './Sparkline/Sparkline'
export { Switch, type SwitchProps } from './Switch/Switch'
export {
  Table,
  TableCell,
  TableHeaderCell,
  TableRow,
  type TableCellProps,
  type TableHeaderCellProps,
  type TableProps,
  type TableRowProps,
} from './Table/Table'
export { Tabs, type TabItem, type TabsProps } from './Tabs/Tabs'
export { Textarea, type TextareaProps } from './Textarea/Textarea'
export {
  TicketRow,
  TicketTable,
  type TicketRowProps,
  type TicketTableProps,
  type TicketTableSelection,
} from './TicketRow/TicketRow'
export { ticketPriority, ticketStatus } from './TicketRow/ticketLabels'
export { Timeline, type TimelineEvent, type TimelineEventKind, type TimelineProps } from './Timeline/Timeline'
export { Topbar, type TopbarMenuButton, type TopbarProps } from './Topbar/Topbar'
export { Tooltip, type TooltipProps, type TooltipTriggerProps } from './Tooltip/Tooltip'
export { ToastProvider } from './Toast/ToastProvider'
export { Upload, type UploadProps } from './Upload/Upload'
export { useToast, type ToastApi, type ToastOptions, type ToastTone } from './Toast/toastContext'
