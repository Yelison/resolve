// `Field` vive en @yelison/forma-ui; esta carpeta lo reexporta para que `Select`, `Textarea` y `Combobox` sigan importándolo
// desde aquí (ADR 0002). La caja del control que comparten no es del paquete: está en `shared/control.module.css`.
export { Field, type FieldControlProps, type FieldProps } from '@yelison/forma-ui'
