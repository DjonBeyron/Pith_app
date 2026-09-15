import { dbg } from '../../shared/lib/debug.js'
import { renumber, makeNode } from './nodeGraph.js'

// Кнопка «+ Нода» — новая нода примерно по центру видимой области холста, с
// небольшим случайным разбросом (чтобы клик много раз подряд не сажал ноды
// друг на друга). Вынесено из CanvasBoard.jsx — там это была самодостаточная
// функция без внешних зависимостей кроме своих аргументов, а файл упирался
// в потолок 400 строк (CLAUDE.md).
export function addCenterNode({ boardRef, offset, scale, setNodes }) {
  const el = boardRef.current
  const rect = el ? el.getBoundingClientRect() : { width: 900, height: 600 }
  const cx = (rect.width  / 2 - offset.x) / scale - 91 + (Math.random() - 0.5) * 60
  const cy = (rect.height / 2 - offset.y) / scale - 20 + (Math.random() - 0.5) * 60
  setNodes(prev => {
    const created = makeNode(prev.length + 1, cx, cy)
    dbg('[NODE] кнопка «+ Нода»:', created.type, `в ${Math.round(cx)},${Math.round(cy)}`,
      `размер ${created.size}`, `триггеров ${created.triggers.length}`, `было нод ${prev.length}`)
    return renumber([...prev, created])
  })
}
