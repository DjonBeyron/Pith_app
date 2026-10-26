import { useEffect, useRef } from 'react'
import { SLOT_COUNT, ENTER_Y, EXIT_Y, pillYAt, pillFill } from './wordLaneTimeline.js'
import { syncClock } from './wordLaneClock.js'
import { createStudentGame, stepStudent } from './wordLaneStudent.js'
import { snapPill, missPill, SNAP_LEAD_MS } from './wordLaneSnap.js'

// Движок пилюль игры «Повтори за диктором»: rAF пишет в style каждой пилюли `--y` (центр, % высоты экрана) и `--pv` (заливка 0…1) — React на кадры не перерисовывается.
// Конвейер: пилюли катятся вниз с ОДНОЙ скоростью (wordLaneTimeline.SPEED).
//  listen — фаза диктора: положение и заливка — чистые функции времени (pillYAt / pillFill), а время берётся с ЗВУКА (wordLaneClock.syncClock: пока файл озвучки играет по-настоящему,
//           t = audioAt + currentTime файла), поэтому пилюля всегда там, где слово в звуке. Слово началось — пилюля около центра, идёт заливка в такт речи, слово кончилось — щелчок.
//           Пилюли разных дорожек перекрываются во времени как есть, ничего не подвигается.
//  turn   — та же фаза доезжает: последняя пилюля ещё катится вниз под плашкой «Теперь твоя очередь».
//  speak  — фаза ученика (wordLaneStudent.js): пилюли выкатываются сами, ученик успевает или нет; движок шагает игру и рисует её, события (win / fail / miss / done) отдаёт в fx.
//  остальные фазы — все пилюли спрятаны за верхним краем с нулевой заливкой.
// Щелчок (snapPill), промах (missPill) и «огонёк» прогресса под словом (data-dot) — императивно. Подсказка ученику («тень», WordLanePills): метка темпа `--pace` бежит вверх в темпе
// диктора с первого звука ученика; пока слово не подтверждено, заливка «ожидающая» (штриховка), после — сплошная (data-lock); не успел — data-fail (пилюля гаснет).
// fx — реакции игры (useWordLaneFlow): win(order, rect) — пилюля ученика принята (XP, нота, кот), miss() — чужое слово, fail() — не успел, mouth(level) — рот кота по голосу,
// audioMs() — currentTime озвучки автора в мс (или null), finished(locked) — ученик прошёл всё.
export function useWordLanePills(rootRef, { phase, phaseAt, plan, hits, misses, levels, fx }) {
  const live = useRef({ hits, misses })
  const fxRef = useRef(fx)
  const listenRef = useRef(null) // часы фазы диктора: переходят в 'turn' без разрыва
  useEffect(() => { live.current = { hits, misses }; fxRef.current = fx })

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const pills = [...root.querySelectorAll('[data-pill]')]
    const dots = [...root.querySelectorAll('[data-dot]')]
    const clampY = y => Math.min(EXIT_Y, Math.max(ENTER_Y, y))
    const paint = (k, y, p) => { pills[k].style.setProperty('--y', clampY(y).toFixed(2)); pills[k].style.setProperty('--pv', p.toFixed(3)) }
    const reset = k => { paint(k, ENTER_Y, 0); pills[k].style.setProperty('--pace', '0'); pills[k].removeAttribute('data-lock'); pills[k].removeAttribute('data-fail') }
    const hide = () => { for (let k = 0; k < SLOT_COUNT; k++) reset(k) }
    const light = i => dots[i]?.classList.add('wlDot--on')

    // ---------- фаза диктора (и её доезжание под плашкой «твоя очередь») ----------
    if (phase === 'listen' || (phase === 'turn' && listenRef.current)) {
      if (phase === 'listen') {
        dots.forEach(d => d.classList.remove('wlDot--on'))
        pills.forEach(p => { p.setAttribute('data-lock', '1'); p.removeAttribute('data-fail') }) // у диктора заливка всегда «настоящая»
        listenRef.current = { start: phaseAt, drift: 0, last: phaseAt, heard: false, snapped: new Set() }
      }
      const c = listenRef.current
      let raf = 0
      const tick = () => {
        const now = performance.now() // не метка rAF: звук читаем «сейчас», и время таймера должно быть тем же «сейчас», иначе на скорости 2× разница в несколько мс даёт десятки мс рассинхрона
        const audioMs = fxRef.current?.audioMs?.() ?? null
        if (audioMs != null && !c.heard) { // файл только что зазвучал: опоздал — перематываем его вперёд на опоздание (в тишине перед первым словом), картинка при этом идёт ровно
          c.heard = true
          const late = now - c.start - (plan.audioAt ?? 0) - audioMs
          if (late > 30) fxRef.current?.skipAudio?.(late)
        }
        const clock = syncClock({ tTimer: now - c.start, audioMs, audioAt: plan.audioAt ?? 0, drift: c.drift, dt: now - c.last })
        c.drift = clock.drift; c.last = now
        const t = clock.t
        for (let k = 0; k < SLOT_COUNT; k++) {
          const at = plan.fillAt[k]
          const ms = plan.fillMs[k]
          paint(k, pillYAt(t, at), pillFill(t, at, ms, plan.curves[k]))
          if (!c.snapped.has(k) && t >= at + ms - SNAP_LEAD_MS) { c.snapped.add(k); pills[k].setAttribute('data-lock', '1'); snapPill(pills[k], k); light(k) }
        }
        fxRef.current?.mouth?.(plan.mouth(t))
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }

    // ---------- фаза ученика ----------
    if (phase === 'speak') {
      listenRef.current = null
      hide()
      dots.forEach(d => d.classList.remove('wlDot--on'))
      const g = createStudentGame({ fillMs: plan.fillMs })
      g.seenHits = live.current.hits; g.seenMisses = live.current.misses // слушатель стартует ещё в «твоей очереди» — слова до начала конвейера не считаем
      let level = 0
      let raf = 0
      const t0 = performance.now()
      const off = levels?.subscribe(l => { level = l })
      const handle = (e, t) => {
        const el = e.pill ? pills[e.pill.slot] : null
        if (e.type === 'spawn') { el.removeAttribute('data-lock'); el.removeAttribute('data-fail'); el.style.setProperty('--pace', '0') }
        else if (e.type === 'claim') { el.setAttribute('data-lock', '1'); snapPill(el, e.order); light(e.order) } // отклик — в момент, когда слово принято
        else if (e.type === 'win') fxRef.current?.win?.(e.order, el.getBoundingClientRect())
        else if (e.type === 'fail') { el.setAttribute('data-fail', '1'); fxRef.current?.fail?.() }
        else if (e.type === 'miss') { if (el) missPill(el); fxRef.current?.miss?.() }
        else if (e.type === 'done') fxRef.current?.finished?.(e.locked)
        return t
      }
      const tick = now => {
        const t = now - t0
        const { hits: h, misses: m } = live.current
        for (const e of stepStudent(g, t, { level, hits: h, misses: m })) handle(e, t)
        for (let k = 0; k < SLOT_COUNT; k++) {
          const p = g.pills.findLast(x => x.slot === k && !x.gone)
          if (!p) { if (!g.pills.some(x => x.slot === k && !x.gone)) paint(k, ENTER_Y, 0); continue }
          paint(k, p.y, p.p)
          pills[k].style.setProperty('--pace', (p.onset == null || p.state !== 'fly' ? 0 : pillFill(t - p.onset, 0, p.ms, plan.curves[k])).toFixed(3))
        }
        fxRef.current?.mouth?.(level)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => { cancelAnimationFrame(raf); off?.() }
    }

    listenRef.current = null
    hide()
    return undefined
  }, [phase, phaseAt, plan, levels, rootRef])
}
