import { useState, useEffect, useRef } from 'react'
import { levelOf, levelFill, LEVELS } from '../learn/memoryLadder.js'

// Полоска слова в итоге — та же, что у слова во вкладке «Память» (.memChip): заливка и рамка цвета
// ступени, заливка — путь к следующей ступени. Растёт от прежнего значения к новому МЕДЛЕННО (GROW_MS),
// чтобы было видно, как слово пополнилось. Пока заливка растёт, мигает ВСЯ заливка (не только прирост) и
// яркая линия на её границе; падает — спокойно, без мигания (ошибка не повод для фейерверка).
// Ступень выросла — «трубки»: заливка доезжает до края (мигает) и вспыхивает; затем вся трубка уезжает
// влево, а справа параллельно выезжает ПУСТАЯ следующая трубка (цвета и названия новой ступени), и прогресс
// продолжается в ней — заливка пробивает дальше, до места слова на новой ступени; следующая трубка встаёт
// на место прежней. Ступень упала — то же в обратную сторону: прежняя трубка уезжает вправо, слева
// приезжает предыдущая (полная) и спокойно опускается до места слова.
// from/to — шаг памяти до и после (to = null — сервер не ответил, без изменений); settled — слово
// ушло в постоянную память. delay — когда начать (итог ведёт слова по одному, друг за другом).
// Заливка не меняется (слово повторено, а шаг остался — «не сразу» или раньше срока) — заливка
// дважды мягко вспыхивает: слово учтено. go — можно начинать (итог пускает полоски после переноса XP
// в полоску уровня). onDone — полоска доиграла (итог по ним гасит салют).
export const GROW_MS = 1900 // сколько едет заливка (тот же срок — в review-summary.css)
const KEPT_MS = 1400        // вспышка полоски, которая не росла (длина keyframes reviewFillBlink × 2)
const EDGE_TAIL_MS = 500    // линия на границе мигает ещё чуть-чуть после остановки заливки
const FLASH_MS = 450        // полная полоска вспыхивает, прежде чем уехать
const SLIDE_MS = 800        // трубки едут (CSS: .reviewBarRail--slide) и в новой растёт заливка
const MIN_FILL = 0.06
const RANK = { 1: 1, 2: 2, 3: 3, Perm: 4 }
const look = (step, perm) => (perm
  ? { lvl: 'Perm', fill: 1 }
  : { lvl: levelOf(step), fill: Math.max(levelFill(step), MIN_FILL) })

// Одна трубка: заливка, линия на границе, слово и название ступени
function Tube({ word, t, next = false }) {
  const cls = ['grow', 'flash', 'kept', 'fast', 'still'].filter(k => t[k]).map(k => ` reviewBar--${k}`).join('') + (next ? ' reviewBar--next' : '')
  return (
    <div className={`memChip memChip--${t.lvl} reviewBar${cls}`}>
      <span className="memChipFill" style={{ width: `${t.fill * 100}%` }} />
      <span className="reviewBarEdge" style={{ left: `${t.fill * 100}%` }} aria-hidden="true" />
      <span className="memChipWord">{word}</span>
      <span className="reviewBarLevel">{t.lvl === 'Perm' ? 'Постоянная память' : LEVELS[t.lvl - 1].name}</span>
    </div>
  )
}

export default function ReviewWordBar({ word, from, to, settled = false, delay = 450, go = true, onDone = null }) {
  // cur — трубка на месте, nxt — вторая (выезжает/заезжает), slide — трубки едут, dir — куда (up: влево, down: вправо)
  const [st, setSt] = useState(() => ({ cur: { ...look(from ?? to, false), still: true }, nxt: null, slide: false, dir: 'up' }))

  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone })

  useEffect(() => {
    if (!go) return undefined
    const a = look(from ?? to, false)
    const b = to == null ? a : look(to, settled)
    const timers = []
    const at = (ms, patch) => timers.push(setTimeout(() => setSt(s => ({ ...s, ...patch })), ms))
    let end
    if (a.lvl === b.lvl) {
      const same = a.fill === b.fill
      const up = b.fill > a.fill
      at(delay, { cur: { ...b, kept: same, grow: up } })
      end = delay + (same ? KEPT_MS : GROW_MS)
      if (up) at(end + EDGE_TAIL_MS, { cur: { ...b } })
    } else if (RANK[b.lvl] > RANK[a.lvl]) {
      const flashAt = delay + GROW_MS
      const nextAt = flashAt + FLASH_MS
      const slideAt = nextAt + 60 // кадр на то, чтобы пустая трубка встала справа — потом едем
      end = slideAt + SLIDE_MS + 80
      at(delay, { cur: { lvl: a.lvl, fill: 1, grow: true } })
      at(flashAt, { cur: { lvl: a.lvl, fill: 1, flash: true } })
      at(nextAt, { nxt: { lvl: b.lvl, fill: 0, still: true }, dir: 'up' })
      at(slideAt, { slide: true, cur: { lvl: a.lvl, fill: 1 }, nxt: { lvl: b.lvl, fill: b.fill, fast: true, grow: true } })
      at(end, { cur: { ...b, still: true }, nxt: null, slide: false }) // новая трубка встала на место прежней
    } else {
      const nextAt = delay + GROW_MS + 350
      const swapAt = nextAt + 60 + SLIDE_MS + 80
      at(delay, { cur: { lvl: a.lvl, fill: MIN_FILL } })
      at(nextAt, { nxt: { lvl: b.lvl, fill: 1, still: true }, dir: 'down' })
      at(nextAt + 60, { slide: true })
      at(swapAt, { cur: { lvl: b.lvl, fill: 1, still: true }, nxt: null, slide: false })
      at(swapAt + 60, { cur: { ...b } }) // и спокойно опускается до места слова
      end = swapAt + 60 + GROW_MS
    }
    timers.push(setTimeout(() => onDoneRef.current?.(), end))
    return () => timers.forEach(clearTimeout)
  }, [from, to, settled, delay, go])

  const two = !!st.nxt
  // В потоке всегда только текущая трубка — она одна задаёт размер, и плашка в ленте не раздувается на время слайда.
  // Вторая лежит рядом абсолютно (справа при росте ступени, слева при падении) и въезжает вместе с дорожкой
  return (
    <div className="reviewBarTrack">
      <div className={`reviewBarRail${st.dir === 'down' ? ' reviewBarRail--down' : ''}${st.slide ? ' reviewBarRail--slide' : ''}`}>
        <Tube key="c" word={word} t={st.cur} />
        {two && <Tube key="n" word={word} t={st.nxt} next />}
      </div>
    </div>
  )
}
