import { useMemo } from 'react'
import { ArticleOutline } from './ArticleOutline'
import { ArticleProse } from './ArticleProse'
import { ArticleBody } from './markdown/ArticleBody'
import { outline } from './markdown/outline'
import styles from './ArticlePreview.module.css'

/**
 * Vista previa del texto que se está escribiendo, con el mismo `ArticleBody` y el mismo índice que la lectura. Es el
 * único módulo del editor que importa `react-markdown`: el editor lo carga con `lazy`, así que no se descarga hasta
 * que alguien abre la pestaña.
 */
export default function ArticlePreview({ source }: { source: string }) {
  const entries = useMemo(() => outline(source), [source])
  return (
    <div className={styles.preview}>
      <ArticleOutline entries={entries} variant="details" />
      <ArticleProse>
        <ArticleBody source={source} />
      </ArticleProse>
    </div>
  )
}
