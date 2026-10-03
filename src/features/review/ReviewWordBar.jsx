import { useState, useEffect, useRef } from 'react'
import { levelOf, levelFill, LEVELS } from '../learn/memoryLadder.js'

// Полоска слова в итоге — та же, что у слова во вкладке «Память» (.memChip):
// заливка и рамка цвета ступени, заливка — путь к следующей ступени. Растёт от прежнего
// значения к новому МЕДЛЕННО (GROW_MS), чтобы было видно, как слово пополнилось. Пока заливка
// растёт, мигает ВСЯ заливка (не только прирост) и яркая линия на её границе; падает — спокойно,
// без мигания (ошибка не повод для фейерверка).
// Ступень выросла — переход в четыре такта, чтобы было понятно «слово перешло на следующую»:
//   1) заливка доезжает до края (мигает), 2) полная полоска вспыхивает и чуть вздувается,
//   3) цвет и название ступени плавно меняются (название «выскакивает»), 4) полоска мягко оседает
//   до места слова на новой ступени. Ступень упала — старая опустошается, новая стартует полной и оседает.
// from/to — шаг памяти до и после (to = null — сервер не ответил, без изменений); settled — слово
// ушло в постоянную память. delay — когда начать (итог ведёт слова по одному, друг за другом).
// Заливка не меняется (слово повторено, а шаг остался — «не сразу» или раньше срока) — заливка
// дважды мягко вспыхивает: слово учтено. go — можно начинать (итог пускает полоски после переноса XP
// в полоску уровня). onDone — полоска доиграла (итог по ним гасит салют).
export const GROW_MS = 1900 // сколько едет заливка (тот же срок — в review-summary.css)
const KEPT_MS = 1400        // вспышка полоски, которая не росла (длина keyframes reviewFillBlink × 2)
const EDGE_TAIL_MS = 500    // линия на границе мигает ещё чуть-чуть после остановки заливки
const FLASH_MS = 450        // полная полоска вспыхивает прежним цветом
const RECOLOR_MS = 650      // цвет и название сменились, полоска ещё полная
const SETTLE_MS = 900       // полоска оседает до места слова на новой ступени (CSS: .reviewBar--settle)
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
      const up = b.fill > a.fill
      at(delay, { ...b, still: false, kept: same, grow: up })
      end = delay + (same ? KEPT_MS : GROW_MS)
      if (up) at(end + EDGE_TAIL_MS, { ...b, still: false, grow: false })
    } else if (RANK[b.lvl] > RANK[a.lvl]) {
      const flashAt = delay + GROW_MS
      const recolorAt = flashAt + FLASH_MS
      const settleAt = recolorAt + RECOLOR_MS
      at(delay, { lvl: a.lvl, fill: 1, still: false, grow: true })
      at(flashAt, { lvl: a.lvl, fill: 1, still: false, flash: true })
      at(recolorAt, { lvl: b.lvl, fill: 1, still: false, flash: true, up: true })
      if (b.fill < 1) at(settleAt, { ...b, still: false, up: true, settle: true })
      end = b.fill < 1 ? settleAt + SETTLE_MS : recolorAt + RECOLOR_MS
    } else {
      at(delay, { lvl: a.lvl, fill: MIN_FILL, still: false })
      at(delay + GROW_MS + 350, { lvl: b.lvl, fill: 1, still: true })
      at(delay + GROW_MS + 410, { ...b, still: false })
      end = delay + 2 * GROW_MS + 410
    }
    timers.push(setTimeout(() => onDoneRef.current?.(), end))
    return () => timers.forEach(clearTimeout)
  }, [from, to, settled, delay, go])

  const perm = cur.lvl === 'Perm'
  return (
    <div className={`memChip memChip--${cur.lvl} reviewBar${cur.still ? ' reviewBar--still' : ''}${cur.kept ? ' reviewBar--kept' : ''}${cur.grow ? ' reviewBar--grow' : ''}${cur.flash ? ' reviewBar--flash' : ''}${cur.up ? ' reviewBar--up' : ''}${cur.settle ? ' reviewBar--settle' : ''}`}>
      <span className="memChipFill" style={{ width: `${cur.fill * 100}%` }} />
      <span className="reviewBarEdge" style={{ left: `${cur.fill * 100}%` }} aria-hidden="true" />
      <span className="memChipWord">{word}</span>
      <span className="reviewBarLevel">{perm ? 'Постоянная память' : LEVELS[cur.lvl - 1].name}</span>
    </div>
  )
}
