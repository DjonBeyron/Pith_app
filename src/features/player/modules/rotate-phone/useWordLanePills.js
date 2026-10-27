import { useEffect, useRef } from 'react'
import { SLOT_COUNT, TRAVEL_MS, pillFill } from './wordLaneTimeline.js'
import { createAligner } from './wordLaneClock.js'
import { startFlight, cancelFlights, setFlightRate } from './wordLaneMotion.js'
import { createStudentGame, stepStudent } from './wordLaneStudent.js'
import { createVoiceGate } from './wordLaneVoiceGate.js'
import { snapPill, missPill, SNAP_LEAD_MS } from './wordLaneSnap.js'

// Движок пилюль игры «Повтори за диктором». ДВИЖЕНИЕ пилюль ведёт композитор (wordLaneMotion.js: одна линейная WAAPI-анимация на пилюлю — скорость конвейера постоянна), поэтому лаги основного
// потока на смартфонах (Vosk, React, щелчок с искрами) на ход не влияют. JS каждый кадр считает только логику и пишет заливку (transform fill-слоя, без custom-property и пересчёта стилей детей).
//  listen — фаза диктора: пилюли летят по плану (анимация k стартует в spawn = начало слова − TRAVEL_MS), «время плана» = положение анимации. Пока файл озвучки играет, скорость полёта чуть
//           выравнивается под его currentTime РЕДКО и разово (wordLaneClock.createAligner: перемотка опоздавшего звука fx.skipAudio, одна короткая подкрутка ±5 %, скачок при крупном разрыве) —
//           скорость полёта каждый кадр не трогаем (на смартфонах это подлагивало). Слово началось — заливка в такт речи, слово
//           кончилось — щелчок.
//  turn   — та же фаза доезжает: последняя пилюля ещё катится вниз под плашкой «Теперь твоя очередь».
//  speak  — фаза ученика (wordLaneStudent.js): пилюли выкатываются сами (новый полёт на каждый spawn), ученик успевает или нет; движок шагает игру, события (win / fail / miss / done) — в fx.
//           «Худ» в пилюле (тень слова и метка темпа) реагирует ТОЛЬКО на голос: нет голоса — их нет, звук есть — прозрачность следует громкости (style.opacity), метка бежит с первого звука.
//  остальные фазы — все пилюли спрятаны за верхним краем с нулевой заливкой.
// Щелчок (snapPill), промах (missPill) и «огонёк» прогресса под словом (data-dot) — императивно. Пока слово не подтверждено, заливка «ожидающая» (штриховка), после — сплошная (data-lock);
// не успел — data-fail (пилюля гаснет).
// fx — реакции игры (useWordLaneFlow): win(order, rect) — пилюля ученика принята (XP, нота, кот), miss() — чужое слово, fail() — не успел, mouth(level) — рот кота по голосу,
// audioMs() — currentTime озвучки автора в мс плана (или null), skipAudio(ms) — перемотать звук вперёд, finished(locked) — ученик прошёл всё.
export function useWordLanePills(rootRef, { phase, phaseAt, plan, hits, misses, levels, fx }) {
  const live = useRef({ hits, misses })
  const fxRef = useRef(fx)
  const listenRef = useRef(null) // полёты и состояние фазы диктора: переходят в 'turn' без разрыва
  useEffect(() => { live.current = { hits, misses }; fxRef.current = fx })

  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const pills = [...root.querySelectorAll('[data-pill]')]
    const fills = pills.map(p => p.querySelector('.wlPillFill'))
    const ghosts = pills.map(p => p.querySelector('.wlGhost'))
    const paces = pills.map(p => p.querySelector('.wlPace'))
    const dots = [...root.querySelectorAll('[data-dot]')]
    const light = i => dots[i]?.classList.add('wlDot--on')
    // Запись в DOM только при изменении значения: лишние записи стоили бы пересчёта стилей на слабом телефоне
    const cache = new Map()
    const put = (el, prop, value) => { const prev = cache.get(el) ?? {}; if (prev[prop] === value) return; prev[prop] = value; cache.set(el, prev); el.style[prop] = value }
    const paintFill = (k, v) => put(fills[k], 'transform', `scaleY(${Math.min(1, Math.max(0, v)).toFixed(3)})`)
    const hint = (k, op, pace) => { put(ghosts[k], 'opacity', op); put(paces[k], 'opacity', pace == null ? '0' : '0.9'); if (pace != null) put(paces[k], 'transform', `translateY(${(-pace * 100).toFixed(1)}%)`) }
    const reset = k => { paintFill(k, 0); hint(k, '0', null); pills[k].removeAttribute('data-lock'); pills[k].removeAttribute('data-fail') }
    const hide = () => { if (listenRef.current) { clearTimeout(listenRef.current.nudge); cancelFlights(listenRef.current.anims) } for (let k = 0; k < SLOT_COUNT; k++) reset(k) }

    // ---------- фаза диктора (и её доезжание под плашкой «твоя очередь») ----------
    if (phase === 'listen' || (phase === 'turn' && listenRef.current)) {
      if (phase === 'listen') {
        dots.forEach(d => d.classList.remove('wlDot--on'))
        if (listenRef.current) { clearTimeout(listenRef.current.nudge); cancelFlights(listenRef.current.anims) }
        for (let k = 0; k < SLOT_COUNT; k++) { reset(k); pills[k].setAttribute('data-lock', '1') } // у диктора заливка всегда «настоящая»
        const spawn = plan.fillAt.map(at => at - TRAVEL_MS)
        const now = performance.now() - phaseAt
        // Все три полёта стартуют сразу; у ещё не выкатившихся время отрицательное — они ждут за верхним краем
        listenRef.current = { anims: pills.map((el, k) => startFlight(el, now - spawn[k])), spawn, align: createAligner(), last: performance.now(), nudge: 0, snapped: new Set() }
      }
      const c = listenRef.current
      let raf = 0
      const tick = () => {
        const nowMs = performance.now()
        const t = Number(c.anims[0].currentTime) + c.spawn[0]            // время плана = где сейчас картинка
        const audioMs = fxRef.current?.audioMs?.() ?? null
        // Выравнивание по звуку — редкие разовые действия, а не поправка скорости каждый кадр (см. wordLaneClock.js)
        const act = c.align.step({ planMs: t, audioMs, audioAt: plan.audioAt ?? 0, now: nowMs, dt: nowMs - c.last })
        c.last = nowMs
        if (act?.type === 'skip') fxRef.current?.skipAudio?.(act.ms)          // звук опоздал — перематываем его вперёд (в тишине перед первым словом)
        else if (act?.type === 'jump') c.anims.forEach(a => { a.currentTime = Number(a.currentTime) + act.ms })
        else if (act?.type === 'nudge') {                                      // небольшой остаток: одна короткая подкрутка скорости и снова ровно
          setFlightRate(c.anims, act.rate, 1)
          clearTimeout(c.nudge)
          c.nudge = setTimeout(() => setFlightRate(c.anims, 1, act.rate), act.hold)
        }
        for (let k = 0; k < SLOT_COUNT; k++) {
          const at = plan.fillAt[k]
          const ms = plan.fillMs[k]
          paintFill(k, pillFill(t, at, ms, plan.curves[k]))
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
      hide(); listenRef.current = null
      dots.forEach(d => d.classList.remove('wlDot--on'))
      const flights = Array(SLOT_COUNT).fill(null)
      const g = createStudentGame({ fillMs: plan.fillMs })
      g.seenHits = live.current.hits; g.seenMisses = live.current.misses // слушатель стартует ещё в «твоей очереди» — слова до начала конвейера не считаем
      let raw = 0
      let level = 0                      // громкость ПОСЛЕ ворот: 0, пока голоса ученика нет (шум и эхо ноты не в счёт)
      let raf = 0
      let lastNow = performance.now()
      const gate = createVoiceGate()
      const t0 = performance.now()
      const off = levels?.subscribe(l => { raw = l })
      const handle = e => {
        const el = e.pill ? pills[e.pill.slot] : null
        if (e.type === 'spawn') {
          const k = e.pill.slot
          reset(k)
          try { flights[k]?.cancel() } catch { /* уже снята */ }
          flights[k] = startFlight(el, performance.now() - t0 - e.pill.spawnAt)
        }
        else if (e.type === 'claim') { el.setAttribute('data-lock', '1'); snapPill(el, e.order); light(e.order) } // отклик — в момент, когда слово принято
        else if (e.type === 'win') { gate.mute(performance.now()); fxRef.current?.win?.(e.order, el.getBoundingClientRect()) } // нота-награда: микрофон слышит динамик — голосом это не считаем
        else if (e.type === 'fail') { el.setAttribute('data-fail', '1'); fxRef.current?.fail?.() }
        else if (e.type === 'miss') { if (el) missPill(el); fxRef.current?.miss?.() }
        else if (e.type === 'done') fxRef.current?.finished?.(e.locked)
      }
      const tick = now => {
        const t = now - t0
        level = gate.step(raw, now, now - lastNow).level; lastNow = now
        const { hits: h, misses: m } = live.current
        for (const e of stepStudent(g, t, { level, hits: h, misses: m })) handle(e)
        const talking = level > 0
        for (let k = 0; k < SLOT_COUNT; k++) {
          const p = g.pills.findLast(x => x.slot === k && !x.gone)
          if (!p) { hint(k, '0', null); continue }
          paintFill(k, p.p)
          // Худ реагирует только на голос: «ловит» его пилюля, которая сейчас на экране и ещё не принята
          const listening = p.state === 'fly' && talking && p.y >= 0 && p.y <= 100
          hint(k, listening ? (0.2 + 0.55 * Math.min(1, level)).toFixed(2) : '0', listening && p.onset != null ? pillFill(t - p.onset, 0, p.ms, plan.curves[k]) : null)
        }
        fxRef.current?.mouth?.(level)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => { cancelAnimationFrame(raf); off?.(); cancelFlights(flights) }
    }

    hide(); listenRef.current = null
    return undefined
  }, [phase, phaseAt, plan, levels, rootRef])
}
