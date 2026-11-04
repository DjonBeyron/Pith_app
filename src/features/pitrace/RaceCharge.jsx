import { useEffect, useRef, useState } from 'react'
import { isWeakDevice } from '../../shared/lib/deviceTier.js'
import { reducedMotion } from '../player/modules/rotate-phone/laneConveyorDrive.js'
import { getVoiceRate } from '../player/lessonVolume.js'
import { buildRaceActs } from './raceRecipe.js'
import { raceFirstLines } from './raceTexts.js'
import { chargeMs, chargePlan, BAR_MIN_PX, BAR_MAX_PX } from './raceCharge.js'

// Заставка-«зарядка» памятью (CONCEPT_RACE.md, «Заставка»; план — raceCharge.js, стили — race-charge.css). Пока Пит говорит race_start и объявляет первый этап, дорожек не видно (data-charge на корне игры,
// его ставит RaceActs), а снизу вверх летят пилюли со словами памяти (цвет — ступень слова) и микро-частицы; сверху бар: каждая долетевшая пилюля добавляет свой сегмент своего цвета и делает бар толще,
// к моменту прилёта последней он заполнен, затем становится полосатым (data-full) и стоит до начала первого раунда, после чего плавно уходит (leaving). Полёт — Web Animations (transform / opacity), на слабом
// устройстве (lite) частиц нет, при reduced-motion пилюли не летят — бар заполняется ступеньками. Снаружи компонент монтирует и размонтирует RaceActs: on — заставка идёт; после on = false бар доживает FADE_MS.
const FADE_MS = 700
const FILL_MS = 260 // заливка сегмента бара перед прилётом пилюли

function ChargeRun({ plan, lines, leaving }) {
  const root = useRef(null)
  const [lite] = useState(isWeakDevice)
  const [still] = useState(reducedMotion)
  const [view] = useState(() => {
    const ids = raceFirstLines(plan, buildRaceActs(plan).acts) // race_start (в полной гонке) и реплика первого этапа
    return chargePlan(plan, chargeMs(lines, ids, getVoiceRate()))
  })
  const [full, setFull] = useState(false)
  const { pills, sparks, segments, totalMs } = view

  useEffect(() => {
    const el = root.current
    const timer = setTimeout(() => setFull(true), totalMs + 40)
    if (el?.animate) {
      const dist = Math.max(200, el.clientHeight - 62) // до бара: пилюля останавливается под ним и гаснет
      const fly = (node, o, big) => node?.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-dist}px)`, opacity: 1, offset: 0.9 }, { transform: `translateY(${-dist - (big ? 12 : 4)}px)`, opacity: 0 }], { delay: o.startAt, duration: o.flyMs, fill: 'both', easing: 'linear' })
      if (!still) {
        pills.forEach(p => fly(el.querySelector(`[data-pill="${p.i}"]`), p, true))
        sparks.forEach(s => fly(el.querySelector(`[data-spark="${s.i}"]`), s, false))
      }
      segments.forEach(s => {
        const node = el.querySelector(`[data-seg="${s.i}"]`)
        if (still) node?.animate([{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'none' }], { delay: s.at, duration: 1, fill: 'both' })
        else node?.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { delay: Math.max(0, s.at - FILL_MS), duration: Math.min(FILL_MS, s.at), fill: 'both', easing: 'ease-out' })
      })
      const k = segments.length // бар толстеет ступенькой с каждой долетевшей пилюлей
      const h = i => `${BAR_MIN_PX + ((BAR_MAX_PX - BAR_MIN_PX) * i) / k}px`
      const keys = [{ height: h(0), offset: 0 }]
      segments.forEach((s, i) => { keys.push({ height: h(i), offset: Math.min(1, Math.max(0, (s.at - 120) / totalMs)) }, { height: h(i + 1), offset: Math.min(1, s.at / totalMs) }) })
      el.querySelector('[data-bar]')?.animate(keys, { duration: totalMs, fill: 'both', easing: 'linear' })
    }
    return () => clearTimeout(timer)
  }, [pills, sparks, segments, totalMs, still])

  return (
    <div ref={root} className="raceCharge" data-leaving={leaving || undefined} data-full={full || undefined} data-testid="race-charge" aria-hidden="true">
      <div className="raceChargeBar" data-bar data-testid="race-charge-bar">
        {segments.map(s => <i key={s.i} data-seg={s.i} className="raceChargeSeg" style={{ left: `${s.from}%`, width: `${s.to - s.from}%`, backgroundColor: s.color }} data-testid="race-charge-seg" />)}
      </div>
      {!still && pills.map(p => <span key={p.i} data-pill={p.i} className="raceChargePill" style={{ left: `${p.x}%`, '--c': p.color }} data-testid="race-charge-pill">{p.text}</span>)}
      {!lite && !still && sparks.map(s => <i key={s.i} data-spark={s.i} className="raceChargeSpark" style={{ left: `${s.x}%`, width: s.size, height: s.size, backgroundColor: s.color }} />)}
    </div>
  )
}

export default function RaceCharge({ plan, lines = null, on }) {
  const [st, setSt] = useState({ on, seq: on ? 1 : 0, gone: 0 }) // seq — номер показа заставки (перезапуск игры — новый показ); gone — показ, который уже растворился
  if (on !== st.on) setSt({ ...st, on, seq: on ? st.seq + 1 : st.seq })
  useEffect(() => {
    if (on || !st.seq) return undefined
    const id = setTimeout(() => setSt(s => ({ ...s, gone: s.seq })), FADE_MS)
    return () => clearTimeout(id)
  }, [on, st.seq])
  if (!st.seq || (!on && st.gone === st.seq)) return null
  return <ChargeRun key={st.seq} plan={plan} lines={lines} leaving={!on} />
}
