import { useEffect, useRef } from 'react'
import { createProgressTimeline } from './sceneProgressModel.js'
import { planSceneDurations } from './sceneProgressPlan.js'

// Плавный индикатор прогресса сцены по времени — ОДИН хук и одна модель на три вида: кольцо кружка (kind 'ring':
// stroke-dashoffset дуги), полоса пузыря в ленте и полоса полного экрана (kind 'bar': scaleX на композиторе). Все три
// получают одни и те же события режиссёра (status/index/run/at) и считают их одной чистой моделью, поэтому идут синхронно
// между собой и со сценой; своей копии логики у видов нет. Как у видео-кружка (circleRingProgress) это
// линейная анимация с длительностью, а не тики setState: ни одного перерендера React на кадр. Состояние
// режиссёра (status/index/run) приходит от useScenePlayback на границах реплик; модель
// (sceneProgressModel.js) превращает его в шаги [{ to, ms }], мы запускаем их одной Web Animation на
// элементе (линейный easing, fill: forwards) и по окончании закрепляем значение в style. Пауза —
// заморозка на текущем значении, продолжение — дальше от него; at — момент прихода состояния
// (performance.now() в apply), опоздание рендера компенсируется отрицательным delay анимации.
// scene/rate/sound/voice читаются из рефа на старте реплики: оценка длительности (sceneProgressPlan.js)
// не должна пересоздавать анимацию посреди реплики.
// Возвращает ref для элемента (ring — <circle>, bar — <div>). enabled=false (история, замороженная) — ничего не делает.
// Конец: по 'ended' значение доводится до ровно 1 (модель: фиксированный END_MS), а нода, перемонтированная уже доигравшей
// (состояние старше индикатора), сразу рисуется полной — не пустой.

const setValue = (el, kind, C, v) => {
  if (kind === 'ring') el.style.strokeDashoffset = String(Math.round(C * (1 - v) * 1000) / 1000)
  else el.style.transform = `scaleX(${Math.round(v * 10000) / 10000})`
}
const frame = (kind, C, v) => (kind === 'ring'
  ? { strokeDashoffset: String(Math.round(C * (1 - v) * 1000) / 1000) }
  : { transform: `scaleX(${Math.round(v * 10000) / 10000})` })

// trace(msg) — строки в трассу сцены (sceneTrace.js; кружок передаёт её, чтобы видеть, где кольцо «подвисло»): шаги каждого
// состояния, доезд анимации до цели, сколько кольцо стояло у края до 'ended', состояние старше индикатора
export function useSceneProgress({
  scene, voice = null, rate = 1, sound = true, status, index, run, at, kind = 'ring', circumference = 0, enabled = true, trace = null,
}) {
  const elRef = useRef(null)
  const model = useRef(null)
  const anim = useRef(null)
  const latest = useRef(null)
  const mountAt = useRef(null)
  const doneAt = useRef(null) // когда анимация текущего состояния дошла до цели (стоит у края)
  const traceRef = useRef(trace)
  useEffect(() => { latest.current = { scene, voice, rate, sound }; traceRef.current = trace }, [scene, voice, rate, sound, trace])
  // Состояние старше самого индикатора (экран открыли поверх играющей ленты: в пропсах ещё «чужой» playing) — не наше
  useEffect(() => { mountAt.current = performance.now() }, [])

  useEffect(() => {
    const el = elRef.current
    if (!enabled || !el) return
    if (!model.current) model.current = createProgressTimeline()
    const L = latest.current
    if (typeof at === 'number' && mountAt.current != null && at < mountAt.current) {
      // Состояние старше индикатора: доигравшая нода (перемонтирование) — сразу полное кольцо/полоса, не пустое
      traceRef.current?.(`${kind}: состояние ${status} ${index} старше индикатора (на ${Math.round(mountAt.current - at)} мс) → ${status === 'ended' ? 'полное' : 'пропущено'}`)
      if (status === 'ended') { model.current.settle({ status, index, run }, 1); setValue(el, kind, circumference, 1) }
      return
    }
    const t = typeof at === 'number' ? at : performance.now()
    const { durations } = planSceneDurations(L.scene, { rate: L.rate, sound: L.sound, voice: L.voice })
    const stood = doneAt.current != null ? Math.round(performance.now() - doneAt.current) : null
    const { from, steps } = model.current.onState({ status, index, run }, { durations, now: t })
    anim.current?.cancel()
    anim.current = null
    doneAt.current = null
    const run1 = steps.filter(s => s.ms > 0)
    const finalV = steps.length ? steps[steps.length - 1].to : from
    traceRef.current?.(`${kind}: ${status} ${index + 1}/${durations.length} run=${run} от ${from.toFixed(3)} → [${steps.map(s => `${s.to.toFixed(3)} за ${s.ms} мс`).join(', ') || 'стоим'}]`
      + `${stood != null ? ` (стояло у цели ${stood} мс)` : ''} оценки=[${durations.map(Math.round).join(',')}] lag=${Math.round(performance.now() - t)} мс`)
    if (!run1.length || typeof el.animate !== 'function') { setValue(el, kind, circumference, finalV); return }
    setValue(el, kind, circumference, from)
    const total = run1.reduce((a, s) => a + s.ms, 0)
    const kf = [{ ...frame(kind, circumference, from), offset: 0 }]
    let acc = 0
    for (const s of run1) { acc += s.ms; kf.push({ ...frame(kind, circumference, s.to), offset: acc / total }) }
    const lag = Math.max(0, performance.now() - t)
    const a = el.animate(kf, { duration: total, easing: 'linear', fill: 'forwards', delay: -Math.min(lag, total) })
    anim.current = a
    a.onfinish = () => {
      if (anim.current !== a) return
      doneAt.current = performance.now()
      traceRef.current?.(`${kind}: дошло до ${finalV.toFixed(3)} (${status} ${index + 1}), ждём следующее состояние`)
      setValue(el, kind, circumference, finalV); a.cancel(); anim.current = null
    }
  }, [enabled, status, index, run, at, kind, circumference])

  useEffect(() => () => {
    if (anim.current) traceRef.current?.('прогресс: индикатор размонтирован посреди анимации')
    anim.current?.cancel(); anim.current = null
  }, [])
  return elRef
}
