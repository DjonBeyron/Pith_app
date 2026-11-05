import { useEffect, useRef, useState } from 'react'
import { isWeakDevice } from '../../shared/lib/deviceTier.js'
import { reducedMotion } from '../player/modules/rotate-phone/laneConveyorDrive.js'
import { getVoiceRate } from '../player/lessonVolume.js'
import { buildRaceActs } from './raceRecipe.js'
import { openingPlan } from './raceOpening.js'
import { chargePlan, flyDist, flyDx, haloKeys, nudgeFrames, ringFrames, pillLabel } from './raceCharge.js'
import { pathFrames } from './raceChargePath.js'
import { playChargeTap } from './raceChargeTap.js'
import RaceChargePlate from './RaceChargePlate.jsx'

// Заставка-«зарядка» памятью (CONCEPT_RACE.md, «Заставка»; план — raceCharge.js, расписание открытия — raceOpening.js, стили — race-charge.css). Пока Пит говорит race_start и реплику первого этапа, дорожек не видно (data-charge на корне игры,
// его ставит WordLaneGame), а снизу вверх летят пилюли со словами памяти (цвет — ступень слова, лёгкая синусоида по x) и микро-частицы; сверху бар: каждая долетевшая пилюля добавляет свой сегмент своего цвета. Пилюля прилетает ЦЕНТРОМ в центр бара
// и заходит ПОД бар: слой пилюль ниже бара и обрезан по его линии, пилюля уходит под него и гаснет.
// БАР: тонкая подложка постоянной высоты с border-radius 999px — высота не анимируется, скругления круглые всегда. «Толщину» набирает слой-ореол за баром (тот же радиус): transform: scaleY от центра, ступенька за пилюлю (haloKeys).
// ИМПАКТ касания (только transform / opacity): вспышка сегмента цветом слова (CSS, opacity 0,9 → 0 за 300 мс), кольцо-рябь от точки касания (один узел на бар, scale 0,6 → 1,6, 350 мс) и лёгкий толчок всего бара translateY(2px) и обратно;
// на каждое касание — тихий «тык» (raceChargeTap.js; звук играет и на слабом устройстве, и при reduced-motion).
// БАР → ПЛАШКА: когда последнее слово долетело (openingPlan.morphAt, за ~600 мс до конца речи Пита), бар САМ превращается в плашку этапа «Разгон + задание» (RaceChargePlate: clip-path от прямоугольника бара до плашки,
// проявляются название и задание, узор плашки); плашка держится ~1,2 с после речи, затем заставка уходит (plateEnd). Отдельной плашки у первого этапа нет. Полёт — Web Animations (transform / opacity), на слабом устройстве (lite)
// частиц и шлейфа нет (шлейф — «размытие движения» без filter: один хвост-градиент, растяжение; raceCharge.js, data-trail), при reduced-motion пилюли не летят — бар заполняется ступеньками. Снаружи компонент монтирует и размонтирует RaceActs: on — заставка идёт; после on = false заставка доживает FADE_MS.
const FADE_MS = 700
const FILL_MS = 260 // заливка сегмента бара перед прилётом пилюли

function ChargeRun({ plan, lines, leaving }) {
  const root = useRef(null), barRef = useRef(null)
  const [lite] = useState(isWeakDevice)
  const [still] = useState(reducedMotion)
  const [view] = useState(() => {
    const o = openingPlan(plan, lines, getVoiceRate()), a = buildRaceActs(plan).acts[0]
    return { o, round: { title: a?.title ?? '', task: a?.task ?? '' }, ...chargePlan(plan, o.morphAt) } // слова летят до morphAt: к этому моменту бар заполнен
  })
  const [full, setFull] = useState(false), [morph, setMorph] = useState(false), [done, setDone] = useState(false)
  const trail = !lite && !still // шлейф «размытия движения»: не на слабом устройстве и не при reduced-motion
  const { pills, sparks, segments, totalMs, o, round } = view

  useEffect(() => {
    const el = root.current
    const timers = []
    const at = (ms, fn) => timers.push(setTimeout(fn, Math.max(0, ms)))
    at(totalMs + 40, () => setFull(true)); at(o.morphAt, () => setMorph(true)); at(o.plateEnd, () => setDone(true))
    const bar = el?.querySelector('[data-bar]'), ring = el?.querySelector('[data-ring]'), ringF = ringFrames()
    segments.forEach(s => at(s.at, () => {
      playChargeTap() // тихий «тык» о бар: звук, не графика — играет и на lite
      if (still || !ring?.animate) return
      ring.style.setProperty('--rc', s.color)
      ring.animate(ringF.frames, { duration: ringF.duration, easing: 'ease-out' }) // кольцо-рябь от точки касания
    }))
    if (el?.animate) {
      const box = el.getBoundingClientRect()
      const barTop = bar ? bar.getBoundingClientRect().top - box.top : 0
      const fly = (node, o2, dist, dx) => node?.animate(pathFrames({ dx, dist, sign: o2.wave?.sign, trail }), { delay: o2.startAt, duration: o2.flyMs, fill: 'both', easing: 'linear' }) // одна кривая (raceChargePath.js): конец строго в центре бара, дальше пилюля гаснет под баром
      const barBox = bar?.getBoundingClientRect()
      const nudge = nudgeFrames()
      if (!still) {
        pills.forEach(p => { const node = el.querySelector(`[data-pill="${p.i}"]`); const pillH = node?.offsetHeight ?? 28; const dist = flyDist({ height: box.height, pillH, barTop }); if (trail) { node?.style.setProperty('--fly', `${p.flyMs}ms`); node?.style.setProperty('--delay', `${p.startAt}ms`) } fly(node, p, dist, flyDx({ width: box.width, x: p.x, barLeft: barBox ? barBox.left - box.left : 16, barWidth: barBox?.width ?? box.width - 76 })) }) // прилёт: центр пилюли — в центре бара и по y, и по x; --fly/--delay ведут затухание хвоста (CSS-анимация ::before)
        sparks.forEach(sp => { const node = el.querySelector(`[data-spark="${sp.i}"]`); node?.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-Math.max(200, box.height - 62)}px)`, opacity: 1, offset: 0.9 }, { transform: `translateY(${-Math.max(200, box.height - 62) - 4}px)`, opacity: 0 }], { delay: sp.startAt, duration: sp.flyMs, fill: 'both', easing: 'linear' }) })
      }
      segments.forEach(s => {
        const node = el.querySelector(`[data-seg="${s.i}"]`)
        if (still) node?.animate([{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'none' }], { delay: s.at, duration: 1, fill: 'both' })
        else node?.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { delay: Math.max(0, s.at - FILL_MS), duration: Math.min(FILL_MS, s.at), fill: 'both', easing: 'ease-out' })
        if (!still) bar?.animate(nudge.frames, { delay: s.at, duration: nudge.duration, easing: 'ease-out' }) // касание: лёгкий толчок всего бара (translateY 2 px и обратно)
      })
      if (!still) { const h = haloKeys(segments); el.querySelector('[data-halo]')?.animate(h.keys, { duration: h.duration, fill: 'both', easing: 'linear' }) } // «толщина»: scaleY ореола ступенькой за пилюлю, высота бара не меняется
    }
    return () => timers.forEach(clearTimeout)
  }, [pills, sparks, segments, totalMs, o, still, trail])

  return (
    <div ref={root} className="raceCharge" data-leaving={leaving || done || undefined} data-full={full || undefined} data-trail={trail || undefined} data-lite={lite || still || undefined} data-testid="race-charge" aria-hidden="true">
      <div ref={barRef} className="raceChargeBar" data-bar data-morph={morph || undefined} data-testid="race-charge-bar">
        <i className="raceChargeHalo" data-halo />
        <div className="raceChargeTrack">
          {segments.map(s => <i key={s.i} data-seg={s.i} className="raceChargeSeg" style={{ left: `${s.from}%`, width: `${s.to - s.from}%`, backgroundColor: s.color, '--c': s.color, '--at': `${s.at}ms` }} data-testid="race-charge-seg" />)}
        </div>
        <i className="raceChargeRing" data-ring />
      </div>
      {!still && <div className="raceChargePills" data-testid="race-charge-pills">{pills.map(p => <span key={p.i} data-pill={p.i} className="raceChargePill" style={{ left: `${p.x}%`, '--c': p.color }} data-testid="race-charge-pill">{pillLabel(p.text)}</span>)}</div>}
      {!lite && !still && sparks.map(s => <i key={s.i} data-spark={s.i} className="raceChargeSpark" style={{ left: `${s.x}%`, width: s.size, height: s.size, backgroundColor: s.color }} />)}
      {morph && <RaceChargePlate title={round.title} task={round.task} barRef={barRef} />}
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
