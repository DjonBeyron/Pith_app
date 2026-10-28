import { useMemo } from 'react'
import { renderTree } from '../../scene/v2/renderTree.js'

// Превью одного спрайта из реестра: <svg viewBox> с деревом build(props). Для кота —
// mouth выбирает видимую визему (атрибут data-mouth на корне, CSS в admin-scenes.css
// .scPrev), emotion/palette/gender — через props build. size — высота в px (ширина по
// пропорции viewBox); для мини-превью в выпадашках слотов — 28–36 px.
export default function SpritePreview({ sprite, props, mouth = 'closed', size = 72, className = '', title }) {
  const tree = useMemo(() => {
    if (!sprite) return null
    const t = sprite.build({ ...(props ?? {}), mouth }) // mouth читает маскот (форма рта в дереве); обычный кот — через data-mouth ниже
    if (sprite.kind === 'cat' && t?.attrs) return { ...t, attrs: { ...t.attrs, 'data-mouth': mouth } }
    return t
  }, [sprite, props, mouth])
  if (!sprite || !tree) return null
  const [, , w, h] = sprite.viewBox.split(/\s+/).map(Number)
  const width = Math.round(size * (w / h))
  return (
    <svg
      className={`scPrev ${className}`.trim()} viewBox={sprite.viewBox} width={width} height={size}
      role="img" aria-label={title ?? sprite.title} preserveAspectRatio="xMidYMid meet"
    >
      {renderTree(tree)}
    </svg>
  )
}
