import { useState, useEffect, useRef } from 'react'
import { levelOf, levelFill, LEVELS } from '../learn/memoryLadder.js'

// Полоска слова в итоге — та же, что у слова во вкладке «Память» (.memChip):
// заливка и рамка цвета ступени, заливка — путь к следующей ступени. Растёт от прежнего
// значения к новому МЕДЛЕННО (GROW_MS), чтобы было видно, как слово пополнилось. Ступень
// сменилась — старая дозаливается (или опустошается), затем новая набирает
// с начала. from/to — шаг памяти до и после (to = null — сервер не ответил,
// без изменений); settled — слово ушло в постоянную память. delay — когда начать
// (итог ведёт слова по одному, друг за другом). Заливка не меняется (слово повторено,
// а шаг остался — «не сразу» или раньше срока) — полоска один раз мягко вспыхивает, чтобы было
// видно: слово учтено. go — можно начинать (итог пускает полоски после переноса XP в полоску уровня).
// Пока заливка едет, на её границе мигает яркая линия (.reviewBarEdge), чтобы рост был заметен.
// onDone — полоска доиграла (итог по ним гасит салют).
export const GROW_MS = 1600 // сколько едет заливка (тот же срок — в review-summary.css)
const KEPT_MS = 1400        // вспышка полоски, которая не росла (длина keyframes reviewBarKept)
const EDGE_TAIL_MS = 500    // линия на границе мигает ещё чуть-чуть после остановки заливки
const MIN_FILL = 0.06
const RANK = { 1: 1, 2: 2, 3: 3, Perm: 4 }
const look = (step, perm) => (perm
  ? { lvl: 'Perm', fill: 1 }
  : { lvl: levelOf(step), fill: Math.max(levelFill(step), MIN_FILL) })

export default function ReviewWordBar({ word, from, to, settled = false, delay = 450, go = true, onDone = null }) {
  const [cur, setCur] = useState(() => ({ ...look(from ?? to, false), still: true }))

  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone })

  useEffect(() => {
    if (!go) return undefined
    const a = look(from ?? to, false)
    const b = to == null ? a : look(to, settled)
    const timers = []
    const at = (ms, v) => timers.push(setTimeout(() => setCur(v), ms))
    let end
    if (a.lvl === b.lvl) {
      const same = a.fill === b.fill
      at(delay, { ...b, still: false, kept: same, grow: !same })
      end = delay + (same ? KEPT_MS : GROW_MS)
      if (!same) at(end + EDGE_TAIL_MS, { ...b, still: false, grow: false })
    } else {
      const up = RANK[b.lvl] > RANK[a.lvl]
      at(delay, { lvl: a.lvl, fill: up ? 1 : MIN_FILL, still: false, grow: true })
      at(delay + GROW_MS + 350, { lvl: b.lvl, fill: up ? MIN_FILL : 1, still: true, grow: false })
      at(delay + GROW_MS + 410, { ...b, still: false, grow: true })
      end = delay + 2 * GROW_MS + 410
      at(end + EDGE_TAIL_MS, { ...b, still: false, grow: false })
    }
    timers.push(setTimeout(() => onDoneRef.current?.(), end))
    return () => timers.forEach(clearTimeout)
  }, [from, to, settled, delay, go])

  const perm = cur.lvl === 'Perm'
  return (
    <div className={`memChip memChip--${cur.lvl} reviewBar${cur.still ? ' reviewBar--still' : ''}${cur.kept ? ' reviewBar--kept' : ''}${cur.grow ? ' reviewBar--grow' : ''}`}>
      <span className="memChipFill" style={{ width: `${cur.fill * 100}%` }} />
      <span className="reviewBarEdge" style={{ left: `${cur.fill * 100}%` }} aria-hidden="true" />
      <span className="memChipWord">{word}</span>
      <span className="reviewBarLevel">{perm ? 'Постоянная память' : LEVELS[cur.lvl - 1].name}</span>
    </div>
  )
}
