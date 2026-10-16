import { useEffect, useRef } from 'react'
import { createProgressTimeline } from './sceneProgressModel.js'
import { planSceneDurations } from './sceneProgressPlan.js'

// Плавный индикатор прогресса сцены по времени — кольцо кружка (kind 'ring': stroke-dashoffset дуги) и
// полоса полного экрана (kind 'bar': scaleX на композиторе). Как у видео-кружка (circleRingProgress) это
// линейная анимация с длительностью, а не тики setState: ни одного перерендера React на кадр. Состояние
// режиссёра (status/index/run) приходит от useScenePlayback на границах реплик; модель
// (sceneProgressModel.js) превращает его в шаги [{ to, ms }], мы запускаем их одной Web Animation на
// элементе (линейный easing, fill: forwards) и по окончании закрепляем значение в style. Пауза —
// заморозка на текущем значении, продолжение — дальше от него; at — момент прихода состояния
// (performance.now() в apply), опоздание рендера компенсируется отрицательным delay анимации.
// scene/rate/sound/voice читаются из рефа на старте реплики: оценка длительности (sceneProgressPlan.js)
// не должна пересоздавать анимацию посреди реплики.
// Возвращает ref для элемента (ring — <circle>, bar — <div>). enabled=false (история, замороженная) — ничего не делает.

const setValue = (el, kind, C, v) => {
  if (kind === 'ring') el.style.strokeDashoffset = String(Math.round(C * (1 - v) * 1000) / 1000)
  else el.style.transform = `scaleX(${Math.round(v * 10000) / 10000})`
}
const frame = (kind, C, v) => (kind === 'ring'
  ? { strokeDashoffset: String(Math.round(C * (1 - v) * 1000) / 1000) }
  : { transform: `scaleX(${Math.round(v * 10000) / 10000})` })

export function useSceneProgress({ scene, voice = null, rate = 1, sound = true, status, index, run, at, kind = 'ring', circumference = 0, enabled = true }) {
  const elRef = useRef(null)
  const model = useRef(null)
  const anim = useRef(null)
  const latest = useRef(null)
  const mountAt = useRef(null)
  useEffect(() => { latest.current = { scene, voice, rate, sound } }, [scene, voice, rate, sound])
  // Состояние старше самого индикатора (экран открыли поверх играющей ленты: в пропсах ещё «чужой» playing) — не наше
  useEffect(() => { mountAt.current = performance.now() }, [])

  useEffect(() => {
    const el = elRef.current
    if (!enabled || !el) return
    if (!model.current) model.current = createProgressTimeline()
    const L = latest.current
    if (typeof at === 'number' && mountAt.current != null && at < mountAt.current) return
    const t = typeof at === 'number' ? at : performance.now()
    const { durations } = planSceneDurations(L.scene, { rate: L.rate, sound: L.sound, voice: L.voice })
    const { from, steps } = model.current.onState({ status, index, run }, { durations, now: t })
    anim.current?.cancel()
    anim.current = null
    const run1 = steps.filter(s => s.ms > 0)
    const finalV = steps.length ? steps[steps.length - 1].to : from
    if (!run1.length || typeof el.animate !== 'function') { setValue(el, kind, circumference, finalV); return }
    setValue(el, kind, circumference, from)
    const total = run1.reduce((a, s) => a + s.ms, 0)
    const kf = [{ ...frame(kind, circumference, from), offset: 0 }]
    let acc = 0
    for (const s of run1) { acc += s.ms; kf.push({ ...frame(kind, circumference, s.to), offset: acc / total }) }
    const lag = Math.max(0, performance.now() - t)
    const a = el.animate(kf, { duration: total, easing: 'linear', fill: 'forwards', delay: -Math.min(lag, total) })
    anim.current = a
    a.onfinish = () => { if (anim.current !== a) return; setValue(el, kind, circumference, finalV); a.cancel(); anim.current = null }
  }, [enabled, status, index, run, at, kind, circumference])

  useEffect(() => () => { anim.current?.cancel(); anim.current = null }, [])
  return elRef
}
