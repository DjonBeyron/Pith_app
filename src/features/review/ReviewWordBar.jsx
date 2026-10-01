import { useState, useEffect } from 'react'
import { levelOf, levelFill, LEVELS } from '../learn/memoryLadder.js'

// Полоска слова в итоге — та же, что у слова во вкладке «Память» (.memChip):
// заливка и рамка цвета ступени, заливка — путь к следующей ступени. Растёт от прежнего
// значения к новому МЕДЛЕННО (GROW_MS), чтобы было видно, как слово пополнилось. Ступень
// сменилась — старая дозаливается (или опустошается), затем новая набирает
// с начала. from/to — шаг памяти до и после (to = null — сервер не ответил,
// без изменений); settled — слово ушло в постоянную память. delay — когда начать
// (итог ведёт слова по одному, друг за другом).
export const GROW_MS = 1600 // сколько едет заливка (тот же срок — в review-summary.css)
const MIN_FILL = 0.06
const RANK = { 1: 1, 2: 2, 3: 3, Perm: 4 }
const look = (step, perm) => (perm
  ? { lvl: 'Perm', fill: 1 }
  : { lvl: levelOf(step), fill: Math.max(levelFill(step), MIN_FILL) })

export default function ReviewWordBar({ word, from, to, settled = false, delay = 450 }) {
  const [cur, setCur] = useState(() => ({ ...look(from ?? to, false), still: true }))

  useEffect(() => {
    const a = look(from ?? to, false)
    const b = to == null ? a : look(to, settled)
    const timers = []
    const at = (ms, v) => timers.push(setTimeout(() => setCur(v), ms))
    if (a.lvl === b.lvl) at(delay, { ...b, still: false })
    else {
      const up = RANK[b.lvl] > RANK[a.lvl]
      at(delay, { lvl: a.lvl, fill: up ? 1 : MIN_FILL, still: false })
      at(delay + GROW_MS + 350, { lvl: b.lvl, fill: up ? MIN_FILL : 1, still: true })
      at(delay + GROW_MS + 410, { ...b, still: false })
    }
    return () => timers.forEach(clearTimeout)
  }, [from, to, settled, delay])

  const perm = cur.lvl === 'Perm'
  return (
    <div className={`memChip memChip--${cur.lvl} reviewBar${cur.still ? ' reviewBar--still' : ''}`}>
      <span className="memChipFill" style={{ width: `${cur.fill * 100}%` }} />
      <span className="memChipWord">{word}</span>
      <span className="reviewBarLevel">{perm ? 'Постоянная память' : LEVELS[cur.lvl - 1].name}</span>
    </div>
  )
}
