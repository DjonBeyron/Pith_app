import { useEffect, useRef } from 'react'
import {
  SLOT_COUNT, ENTER_Y, ZONE_Y, EXIT_Y, DESCENT_MS, EXIT_MS, LOCK_MS,
  pillY, pillFill, easeOutCubic, easeInCubic, easeInOut, voiceFillStep, drainStep,
} from './wordLaneTimeline.js'
import { snapPill } from './wordLaneSnap.js'

// Движок пилюль игры «Повтори за диктором»: rAF пишет в style каждой пилюли `--y` (центр, % высоты экрана) и `--pv` (заливка 0…1) — React на кадры не перерисовывается.
//  listen — по плану диктора (pillY / pillFill): пилюля опускается в зону голоса, пока слово звучит — заливается по громкости слова, в конце щёлкает и уходит вниз; пилюли по очереди.
//  speak  — по ученику: пилюля опускается в зону и ждёт; пока ученик говорит (levels — громкость микрофона), наливается голосом (voiceFillStep), слово принято (hits) — заливка
//           плавно доходит до 100 %, щелчок, пилюля уходит вниз, следом опускается следующая; чужое слово (misses) — пилюля сливается обратно.
//  остальные фазы — все пилюли спрятаны за верхним краем с нулевой заливкой.
// Щелчок (snapPill) и «огонёк» прогресса под словом (data-dot) — императивно, один раз на пилюлю за фазу.
const BOB_PX = 0.8 // ожидание ученика: пилюля слегка покачивается в зоне голоса (% высоты)

export function useWordLanePills(rootRef, { phase, phaseAt, plan, hits, misses, levels }) {
  const live = useRef({ hits, misses })
  useEffect(() => { live.current = { hits, misses } })

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const pills = [...root.querySelectorAll('[data-pill]')]
    const dots = [...root.querySelectorAll('[data-dot]')]
    const paint = (k, y, p) => { pills[k].style.setProperty('--y', y.toFixed(2)); pills[k].style.setProperty('--pv', p.toFixed(3)) }
    const hide = () => { for (let k = 0; k < SLOT_COUNT; k++) paint(k, ENTER_Y, 0) }
    const done = k => { snapPill(pills[k], k); dots[k]?.classList.add('wlDot--on') }
    dots.forEach(d => d.classList.remove('wlDot--on'))

    if (phase === 'listen') {
      const snapped = new Set()
      let raf = 0
      const tick = now => {
        const t = now - phaseAt
        for (let k = 0; k < SLOT_COUNT; k++) {
          const at = plan.fillAt[k]
          const ms = plan.fillMs[k]
          paint(k, pillY(t, at, ms), pillFill(t, at, ms, plan.curves[k]))
          if (!snapped.has(k) && t >= at + ms) { snapped.add(k); done(k) }
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }

    if (phase === 'speak') {
      const st = Array.from({ length: SLOT_COUNT }, () => ({ mode: 'hidden', t0: 0, y: ENTER_Y, p: 0, from: 0 }))
      let cur = 0
      let level = 0
      let draining = false
      let seenMisses = live.current.misses
      let last = performance.now()
      let raf = 0
      st[0].mode = 'in'; st[0].t0 = last
      const off = levels?.subscribe(l => { level = l })
      const tick = now => {
        const dt = (now - last) / 1000
        last = now
        const { hits: h, misses: m } = live.current
        for (let k = 0; k < SLOT_COUNT; k++) {
          const s = st[k]
          if (s.mode === 'in') {
            const u = (now - s.t0) / DESCENT_MS
            s.y = ENTER_Y + (ZONE_Y - ENTER_Y) * easeOutCubic(u)
            if (u >= 1) { s.mode = 'wait'; s.t0 = now }
          } else if (s.mode === 'wait') {
            s.y = ZONE_Y + BOB_PX * Math.sin((now - s.t0) / 650)
            if (m > seenMisses) draining = true
            if (draining) { s.p = drainStep(s.p, dt); if (s.p <= 0.01) { s.p = 0; draining = false } } else s.p = voiceFillStep(s.p, dt, level)
            if (h > k) { s.mode = 'lock'; s.t0 = now; s.from = s.p; draining = false }
          } else if (s.mode === 'lock') {
            const u = (now - s.t0) / LOCK_MS
            s.p = s.from + (1 - s.from) * easeInOut(u)
            if (u >= 1) {
              s.p = 1; s.mode = 'out'; s.t0 = now
              done(k)
              cur = k + 1
              if (cur < SLOT_COUNT) { st[cur].mode = 'in'; st[cur].t0 = now } // следующая начинает опускаться, пока эта уходит
            }
          } else if (s.mode === 'out') {
            const u = (now - s.t0) / EXIT_MS
            s.y = ZONE_Y + (EXIT_Y - ZONE_Y) * easeInCubic(u)
            if (u >= 1) s.mode = 'gone'
          }
          if (s.mode !== 'hidden') paint(k, s.y, s.p)
        }
        seenMisses = m
        raf = requestAnimationFrame(tick)
      }
      hide()
      raf = requestAnimationFrame(tick)
      return () => { cancelAnimationFrame(raf); off?.() }
    }

    hide()
    return undefined
  }, [phase, phaseAt, plan, levels, rootRef])
}
