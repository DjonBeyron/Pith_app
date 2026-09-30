import { useState, useEffect } from 'react'
import { levelOf, levelFill, journey, LEVELS } from '../learn/memoryLadder.js'

// Полоска слова в итоге — та же, что у слова во вкладке «Память» (.memChip):
// заливка цвета ступени — путь к следующей ступени. Растёт от прежнего
// значения к новому, чтобы было видно, как слово пополнилось. Ступень
// сменилась — старая дозаливается (или опустошается), затем новая набирает
// с начала. from/to — шаг памяти до и после (to = null — сервер не ответил,
// без изменений); settled — слово ушло в постоянную память.
const MIN_FILL = 0.06
const RANK = { 1: 1, 2: 2, 3: 3, Perm: 4 }
const look = (step, perm) => (perm
  ? { lvl: 'Perm', fill: 1 }
  : { lvl: levelOf(step), fill: Math.max(levelFill(step), MIN_FILL) })

export default function ReviewWordBar({ word, from, to, settled = false }) {
  const [cur, setCur] = useState(() => ({ ...look(from ?? to, false), still: true }))

  useEffect(() => {
    const a = look(from ?? to, false)
    const b = to == null ? a : look(to, settled)
    const timers = []
    const at = (ms, v) => timers.push(setTimeout(() => setCur(v), ms))
    if (a.lvl === b.lvl) at(450, { ...b, still: false })
    else {
      const up = RANK[b.lvl] > RANK[a.lvl]
      at(450, { lvl: a.lvl, fill: up ? 1 : MIN_FILL, still: false })
      at(1300, { lvl: b.lvl, fill: up ? MIN_FILL : 1, still: true })
      at(1360, { ...b, still: false })
    }
    return () => timers.forEach(clearTimeout)
  }, [from, to, settled])

  const last = to ?? from
  const perm = cur.lvl === 'Perm'
  const ring = perm || !last ? undefined : `color-mix(in srgb, #b6fe3b ${Math.round(12 + journey(last) * 58)}%, #2a3038)`
  return (
    <div className={`memChip memChip--${cur.lvl} reviewBar${cur.still ? ' reviewBar--still' : ''}`} style={ring ? { '--ring': ring } : undefined}>
      <span className="memChipFill" style={{ width: `${cur.fill * 100}%` }} />
      <span className="memChipWord">{word}</span>
      <span className="reviewBarLevel">{perm ? 'Постоянная память' : LEVELS[cur.lvl - 1].name}</span>
    </div>
  )
}
