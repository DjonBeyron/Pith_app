import { useEffect, useRef, useState } from 'react'
import { isWeakDevice } from '../../shared/lib/deviceTier.js'
import { reducedMotion } from '../player/modules/rotate-phone/laneConveyorDrive.js'
import { flyDist, flyDx, haloKeys, haloReset, nudgeFrames, ringFrames, pillLabel } from './raceCharge.js'
import { pathFrames, tailFrames, tailClip } from './raceChargePath.js'
import { playChargeTap } from './raceChargeTap.js'
import RaceChargePlate from './RaceChargePlate.jsx'

// Один показ «зарядки» бара словами (CONCEPT_RACE.md, «Заставка» и «Бар живёт весь разгон»; план — raceCharge.chargePlan, стили — race-charge.css). Общий для трёх случаев: начало игры, этап 2 («Слушай и лови») — слова летят в бар
// и сверху выскакивает плашка этапа (plate = true; морфа бара в плашку нет, бар остаётся полным 6 px до конца заставки, v3.3.117) — и второй круг («Разгон» / «Слушай и лови») — слова только заряжают бар, плашки нет (plate = false, ореол бара не растёт: тонкий бар, как у постоянного RaceBar.jsx).
// view = { o: { plateAt, morphAt, plateEnd }, round: { title, task, brief }, pills, sparks, segments, totalMs } — расписание и план (RaceCharge.jsx, RaceRoundCharge.jsx). Полёт — Web Animations (transform / opacity / scale), хвост — отдельный узел под пилюлей
// (.raceChargeTail, rotate по касательной к синусоиде, raceChargePath.tailFrames), на слабом устройстве и при reduced-motion частиц и хвоста нет (при reduced-motion пилюли не летят — бар заполняется ступеньками). Касание бара — тихий «тык» (raceChargeTap.js).
const FILL_MS = 260 // заливка сегмента бара перед прилётом пилюли

export default function ChargeRun({ view, leaving = false, plate = true }) {
  const root = useRef(null)
  const [lite] = useState(isWeakDevice)
  const [still] = useState(reducedMotion)
  const [full, setFull] = useState(false), [shown, setShown] = useState(false), [done, setDone] = useState(false) // shown — плашка на экране, done — ей пора уходить
  const trail = !lite && !still // шлейф «размытия движения»: не на слабом устройстве и не при reduced-motion
  const { pills, sparks, segments, totalMs, o, round } = view

  useEffect(() => {
    const el = root.current
    const timers = []
    const at = (ms, fn) => timers.push(setTimeout(fn, Math.max(0, ms)))
    at(totalMs + 40, () => { setFull(true); const halo = el?.querySelector('[data-halo]'); if (halo?.animate) { const rs = haloReset(); halo.animate(rs.frames, { duration: rs.duration, fill: 'both', easing: 'ease-out' }) } }) // слова долетели: бар полный, ореол-«толщина» оседает до тонкого 6 px
    if (plate) { at(o.plateAt ?? o.morphAt, () => setShown(true)); at(o.plateEnd, () => setDone(true)) }
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
      const timing = p => ({ delay: p.startAt, duration: p.flyMs, fill: 'both', easing: 'linear' })
      const barBox = bar?.getBoundingClientRect()
      const nudge = nudgeFrames()
      if (!still) {
        pills.forEach(p => {
          const node = el.querySelector(`[data-pill="${p.i}"]`)
          const pillH = node?.offsetHeight ?? 28
          const dist = flyDist({ height: box.height, pillH, barTop })
          const dx = flyDx({ width: box.width, x: p.x, barLeft: barBox ? barBox.left - box.left : 16, barWidth: barBox?.width ?? box.width - 76 })
          if (trail) { node?.style.setProperty('--fly', `${p.flyMs}ms`); node?.style.setProperty('--delay', `${p.startAt}ms`); el.querySelector(`[data-tail="${p.i}"]`)?.animate(tailFrames({ dx, dist, sign: p.wave?.sign }), timing(p)) } // хвост наклоняется по касательной к синусоиде; --fly/--delay ведут его затухание (CSS)
          node?.animate(pathFrames({ dx, dist, sign: p.wave?.sign, trail }), timing(p)) // одна кривая (raceChargePath.js): конец строго в центре бара, дальше пилюля гаснет под баром
        })
        sparks.forEach(sp => { const node = el.querySelector(`[data-spark="${sp.i}"]`); node?.animate([{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${-Math.max(200, box.height - 62)}px)`, opacity: 1, offset: 0.9 }, { transform: `translateY(${-Math.max(200, box.height - 62) - 4}px)`, opacity: 0 }], { delay: sp.startAt, duration: sp.flyMs, fill: 'both', easing: 'linear' }) })
      }
      segments.forEach(s => {
        const node = el.querySelector(`[data-seg="${s.i}"]`)
        if (still) node?.animate([{ opacity: 0, transform: 'none' }, { opacity: 1, transform: 'none' }], { delay: s.at, duration: 1, fill: 'both' })
        else node?.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { delay: Math.max(0, s.at - FILL_MS), duration: Math.min(FILL_MS, s.at), fill: 'both', easing: 'ease-out' })
        if (!still) bar?.animate(nudge.frames, { delay: s.at, duration: nudge.duration, easing: 'ease-out' }) // касание: лёгкий толчок всего бара (translateY 2 px и обратно)
      })
      if (!still && plate) { const h = haloKeys(segments); el.querySelector('[data-halo]')?.animate(h.keys, { duration: h.duration, fill: 'both', easing: 'linear' }) } // «толщина»: scaleY ореола ступенькой за пилюлю (только в начале игры и на этапе 2: перед плашкой), высота бара не меняется
    }
    return () => timers.forEach(clearTimeout)
  }, [pills, sparks, segments, totalMs, o, still, trail, plate])

  return (
    <div ref={root} className="raceCharge" data-leaving={leaving || undefined} data-full={full || undefined} data-trail={trail || undefined} data-lite={lite || still || undefined} data-round={plate ? undefined : '2'} data-testid="race-charge" aria-hidden="true">
      <div className="raceChargeBar" data-bar data-testid="race-charge-bar">
        {plate && <i className="raceChargeHalo" data-halo />}
        <div className="raceChargeTrack">
          {segments.map(s => <i key={s.i} data-seg={s.i} className="raceChargeSeg" style={{ left: `${s.from}%`, width: `${s.to - s.from}%`, backgroundColor: s.color, '--c': s.color, '--at': `${s.at}ms` }} data-testid="race-charge-seg" />)}
        </div>
        <i className="raceChargeRing" data-ring />
      </div>
      {!still && (
        <div className="raceChargePills" data-testid="race-charge-pills">
          {pills.map(p => (
            <span key={p.i} data-pill={p.i} className="raceChargeFly" style={{ left: `${p.x}%`, '--c': p.color }} data-testid="race-charge-pill">
              {trail && <i className="raceChargeTail" data-tail={p.i} style={{ clipPath: tailClip() }} data-testid="race-charge-tail" />}
              <span className="raceChargePill">{pillLabel(p.text)}</span>
            </span>
          ))}
        </div>
      )}
      {!lite && !still && sparks.map(s => <i key={s.i} data-spark={s.i} className="raceChargeSpark" style={{ left: `${s.x}%`, width: s.size, height: s.size, backgroundColor: s.color }} />)}
      {plate && shown && <RaceChargePlate title={round.title} task={round.task} brief={round.brief} cap={round.cap} out={leaving || done} />}
    </div>
  )
}
