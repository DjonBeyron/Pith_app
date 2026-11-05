import { useEffect, useRef, useState } from 'react'
import { isWeakDevice } from '../../shared/lib/deviceTier.js'
import { reducedMotion } from '../player/modules/rotate-phone/laneConveyorDrive.js'
import { getVoiceRate } from '../player/lessonVolume.js'
import { buildRaceActs } from './raceRecipe.js'
import { raceFirstLines } from './raceTexts.js'
import { chargeMs, chargePlan, flyDist, flyDx, bumpFrames, barKeys, pillLabel, BAR_BUMP_MS } from './raceCharge.js'
import { pathFrames } from './raceChargePath.js'

// Заставка-«зарядка» памятью (CONCEPT_RACE.md, «Заставка»; план — raceCharge.js, стили — race-charge.css). Пока Пит говорит race_start и объявляет первый этап, дорожек не видно (data-charge на корне игры,
// его ставит RaceActs), а снизу вверх летят пилюли со словами памяти (цвет — ступень слова, лёгкая синусоида по x) и микро-частицы; сверху бар: каждая долетевшая пилюля добавляет свой сегмент своего цвета и делает бар толще,
// пилюля прилетает ЦЕНТРОМ в центр бара (flyDist) и заходит ПОД бар: слой пилюль (.raceChargePills) ниже бара по z-index и обрезан по линии бара (clip-path), пилюля уходит под него и скрывается; в момент касания бар плавно (ease-in-out) утолщается до 2× за BAR_BUMP_MS и возвращается за BAR_BACK_MS, пилюля гаснет в баре. Пилюля стартует ниже нижнего края (START_BELOW_PX) и прилетает центром в центр бара по x и y. К моменту прилёта последней бар заполнен (сплошные цветные сегменты, без полос;
// data-full) и плавно худеет до BAR_FULL_PX, стоит до начала первого раунда, после чего плавно уходит (leaving). Полёт — Web Animations (transform / opacity), на слабом
// устройстве (lite) частиц и шлейфа нет (шлейф — «размытие движения» без filter: копии-призраки, градиент-хвост, растяжение; raceCharge.js, data-trail), при reduced-motion пилюли не летят — бар заполняется ступеньками. Снаружи компонент монтирует и размонтирует RaceActs: on — заставка идёт; после on = false бар доживает FADE_MS.
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
  const trail = !lite && !still // шлейф «размытия движения»: не на слабом устройстве и не при reduced-motion
  const { pills, sparks, segments, totalMs } = view

  useEffect(() => {
    const el = root.current
    const timer = setTimeout(() => setFull(true), totalMs + 40)
    if (el?.animate) {
      const bar = el.querySelector('[data-bar]')
      const n = segments.length
      const box = el.getBoundingClientRect()
      const barTop = bar ? bar.getBoundingClientRect().top - box.top : 0
      const fly = (node, o, dist, dx) => node?.animate(pathFrames({ dx, dist, sign: o.wave?.sign, trail }), { delay: o.startAt, duration: o.flyMs, fill: 'both', easing: 'linear' }) // одна кривая (raceChargePath.js): конец строго в центре бара, дальше пилюля гаснет под баром
      const barBox = bar?.getBoundingClientRect()
      const bump = bumpFrames()
      if (!still) {
        pills.forEach(p => { const node = el.querySelector(`[data-pill="${p.i}"]`); const pillH = node?.offsetHeight ?? 28; const dist = flyDist({ height: box.height, pillH, barTop, i: p.i, n }); if (trail) { node?.style.setProperty('--fly', `${p.flyMs}ms`); node?.style.setProperty('--delay', `${p.startAt}ms`) } fly(node, p, dist, flyDx({ width: box.width, x: p.x, barLeft: barBox ? barBox.left - box.left : 16, barWidth: barBox?.width ?? box.width - 76 })) }) // прилёт: центр пилюли — в центре бара и по y, и по x; --fly/--delay ведут затухание хвоста (CSS-анимация ::before)
        sparks.forEach(sp => { const node = el.querySelector(`[data-spark="${sp.i}"]`); node?.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-Math.max(200, box.height - 62)}px)`, opacity: 1, offset: 0.9 }, { transform: `translateY(${-Math.max(200, box.height - 62) - 4}px)`, opacity: 0 }], { delay: sp.startAt, duration: sp.flyMs, fill: 'both', easing: 'linear' }) })
      }
      segments.forEach(s => {
        const node = el.querySelector(`[data-seg="${s.i}"]`)
        if (still) node?.animate([{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'none' }], { delay: s.at, duration: 1, fill: 'both' })
        else node?.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { delay: Math.max(0, s.at - FILL_MS), duration: Math.min(FILL_MS, s.at), fill: 'both', easing: 'ease-out' })
        if (!still) bar?.animate(bump.frames, { delay: Math.max(0, s.at - BAR_BUMP_MS), duration: bump.duration, easing: 'linear' }) // касание: бар плавно утолщается до 2× (пик в момент касания) и возвращается
      })
      const h = barKeys(segments, totalMs) // толщина — ОДНА анимация: ступеньки за пилюлю, потом (после возврата последнего касания) худение до тонкой полоски
      bar?.animate(h.keys, { duration: h.duration, fill: 'both', easing: 'linear' })
    }
    return () => clearTimeout(timer)
  }, [pills, sparks, segments, totalMs, still, trail])

  return (
    <div ref={root} className="raceCharge" data-leaving={leaving || undefined} data-full={full || undefined} data-trail={trail || undefined} data-testid="race-charge" aria-hidden="true">
      <div className="raceChargeBar" data-bar data-testid="race-charge-bar">
        {segments.map(s => <i key={s.i} data-seg={s.i} className="raceChargeSeg" style={{ left: `${s.from}%`, width: `${s.to - s.from}%`, backgroundColor: s.color }} data-testid="race-charge-seg" />)}
      </div>
      {!still && <div className="raceChargePills" data-testid="race-charge-pills">{pills.map(p => <span key={p.i} data-pill={p.i} className="raceChargePill" style={{ left: `${p.x}%`, '--c': p.color }} data-testid="race-charge-pill">{pillLabel(p.text)}</span>)}</div>}
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
