import { useEffect, useRef, useState } from 'react'
import { isWeakDevice } from '../../shared/lib/deviceTier.js'
import { reducedMotion } from '../player/modules/rotate-phone/laneConveyorDrive.js'
import { getVoiceRate } from '../player/lessonVolume.js'
import { buildRaceActs } from './raceRecipe.js'
import { raceFirstLines } from './raceTexts.js'
import { chargeMs, chargePlan, barHeight, flyDist, waveX, BAR_FULL_PX, BAR_THIN_MS, BAR_BUMP, BAR_BUMP_MS, WAVE_STEPS } from './raceCharge.js'

// Заставка-«зарядка» памятью (CONCEPT_RACE.md, «Заставка»; план — raceCharge.js, стили — race-charge.css). Пока Пит говорит race_start и объявляет первый этап, дорожек не видно (data-charge на корне игры,
// его ставит RaceActs), а снизу вверх летят пилюли со словами памяти (цвет — ступень слова, лёгкая синусоида по x) и микро-частицы; сверху бар: каждая долетевшая пилюля добавляет свой сегмент своего цвета и делает бар толще,
// пилюля прилетает ЦЕНТРОМ в центр бара (flyDist), в момент касания бар быстро утолщается до 2× и возвращается (BAR_BUMP_MS), пилюля гаснет в баре. К моменту прилёта последней бар заполнен (сплошные цветные сегменты, без полос;
// data-full) и плавно худеет до BAR_FULL_PX, стоит до начала первого раунда, после чего плавно уходит (leaving). Полёт — Web Animations (transform / opacity), на слабом
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
      const bar = el.querySelector('[data-bar]')
      const n = segments.length
      const box = el.getBoundingClientRect()
      const barTop = bar ? bar.getBoundingClientRect().top - box.top : 0
      const wave = (dist, o) => Array.from({ length: WAVE_STEPS + 1 }, (_, k) => { const u = k / WAVE_STEPS; return { transform: `translate(${waveX(o.wave, u).toFixed(2)}px, ${(-dist * u).toFixed(1)}px)`, opacity: 1, offset: u * 0.94 } })
      const fly = (node, o, dist) => node?.animate([...wave(dist, o), { transform: `translate(0px, ${-dist}px) scale(0.6)`, opacity: 0 }], { delay: o.startAt, duration: o.flyMs, fill: 'both', easing: 'linear' })
      if (!still) {
        pills.forEach(p => { const node = el.querySelector(`[data-pill="${p.i}"]`); fly(node, p, flyDist({ height: box.height, pillH: node?.offsetHeight ?? 28, barTop, i: p.i, n })) }) // прилёт: центр пилюли — в центре бара
        sparks.forEach(sp => { const node = el.querySelector(`[data-spark="${sp.i}"]`); node?.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-Math.max(200, box.height - 62)}px)`, opacity: 1, offset: 0.9 }, { transform: `translateY(${-Math.max(200, box.height - 62) - 4}px)`, opacity: 0 }], { delay: sp.startAt, duration: sp.flyMs, fill: 'both', easing: 'linear' }) })
      }
      segments.forEach(s => {
        const node = el.querySelector(`[data-seg="${s.i}"]`)
        if (still) node?.animate([{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'none' }], { delay: s.at, duration: 1, fill: 'both' })
        else node?.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { delay: Math.max(0, s.at - FILL_MS), duration: Math.min(FILL_MS, s.at), fill: 'both', easing: 'ease-out' })
        if (!still) bar?.animate([{ scale: '1 1' }, { scale: `1 ${BAR_BUMP}`, offset: 0.35 }, { scale: '1 1' }], { delay: Math.max(0, s.at - BAR_BUMP_MS * 0.35), duration: BAR_BUMP_MS, easing: 'ease-in-out' }) // касание: бар быстро утолщается до 2× и возвращается
      })
      const keys = [{ height: `${barHeight(0, n)}px`, offset: 0 }] // бар толстеет ступенькой с каждой долетевшей пилюлей…
      segments.forEach((s, i) => { keys.push({ height: `${barHeight(i, n)}px`, offset: Math.min(1, Math.max(0, (s.at - 120) / totalMs)) }, { height: `${barHeight(i + 1, n)}px`, offset: Math.min(1, s.at / totalMs) }) })
      bar?.animate(keys, { duration: totalMs, fill: 'both', easing: 'linear' })
      bar?.animate([{ height: `${barHeight(n, n)}px` }, { height: `${BAR_FULL_PX}px` }], { delay: totalMs + 40, duration: BAR_THIN_MS, fill: 'both', easing: 'ease-in-out' }) // …а полный плавно худеет до тонкой полоски
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
