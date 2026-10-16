// Модель индикатора прогресса сцены по времени (кольцо кружка, полоса полного экрана) — чистая, без DOM и
// таймеров: время приходит аргументом now (мс), результат — «шаги» анимации [{ to, ms }] от текущего значения,
// которые рисует useSceneProgress.js (WAAPI, линейно, вне React). Прогресс 0…1.
//
// Как устроено (почему нет скачков и пропусков):
//  · режиссёр сообщает только границы реплик (status/index/run); внутри реплики прогресс идёт сам, линейно;
//  · на старте реплики i цель отрезка = (E + d_i) / (E + Σ d_j, j ≥ i), где E — реальное время игры с начала
//    прохода (без пауз), d — оценка длительности (sceneProgressPlan.js). Реальные длины прошедших реплик
//    входят в E, поэтому ошибка оценки гасится сама: короче план — кольцо чуть тормозит, длиннее — догоняет;
//  · значение монотонно (to ≥ текущее): новый отрезок всегда начинается с текущего значения кольца;
//  · пауза замораживает кольцо; продолжение (реплика играет заново с начала — directorCore) идёт дальше от
//    замороженного значения; последняя реплика не выше LAST_CAP до сигнала 'ended', после — доезд до 1;
//  · новый проход (после idle/ended или кольцо петли) — быстрый откат к 0 (REWIND_MS), как у видео-кружка.

export const LAST_CAP = 0.985
export const END_MS = 260
export const REWIND_MS = 300

const clamp01 = v => Math.min(1, Math.max(0, v))

export function createProgressTimeline() {
  let t0 = 0
  let from = 0
  let steps = []          // [{ to, ms }] от from, подряд
  let base = 0            // реального времени игры накоплено до текущего прогона, мс
  let runT = null         // начало текущего прогона (null — пауза/стоим)
  let last = { status: 'idle', index: 0, run: -1 }

  const set = (now, f, list) => { t0 = now; from = f; steps = list }

  function value(now) {
    let t = Math.max(0, now - t0)
    let v = from
    for (const s of steps) {
      if (s.ms <= 0 || t >= s.ms) { t -= Math.max(0, s.ms); v = s.to; continue }
      return v + (s.to - v) * (t / s.ms)
    }
    return v
  }
  const elapsedAt = now => base + (runT == null ? 0 : Math.max(0, now - runT))

  // Событие режиссёра { status, index, run } + durations (мс) + now → шаги для анимации и значение «до»
  function onState(st, { durations = [], now = 0 } = {}) {
    const prev = last
    last = { status: st.status, index: st.index, run: st.run ?? 0 }
    if (st.status === 'idle') { base = 0; runT = null; set(now, 0, []); return { from: 0, steps: [] } }
    if (st.status === 'paused') {
      const v = value(now)
      base = elapsedAt(now); runT = null
      set(now, v, [])
      return { from: v, steps: [] }
    }
    if (st.status === 'ended') {
      const v = value(now)
      base = 0; runT = null
      const list = v < 1 ? [{ to: 1, ms: Math.round(END_MS * (1 - v)) }] : []
      set(now, v, list)
      return { from: v, steps: list }
    }
    // playing: новая реплика или та же после паузы
    const loopOne = durations.length === 1 && prev.status === 'playing' && (st.run ?? 0) !== prev.run
    const fresh = prev.status === 'idle' || prev.status === 'ended' || loopOne
      || (st.index === 0 && prev.status === 'playing' && prev.index > 0)
    const before = durations.slice(0, st.index).reduce((a, b) => a + b, 0)
    const rest = durations.slice(st.index).reduce((a, b) => a + b, 0)
    // Вход в середину сцены (экран открыли на 3-й реплике): считаем, что предыдущие уже «сыграны»
    const seeded = fresh && prev.status === 'idle' && st.index > 0
    let startV = value(now)
    const list = []
    if (fresh) {
      if (seeded) { startV = before / (before + rest || 1); base = before }
      else { base = 0; if (startV > 0) list.push({ to: 0, ms: REWIND_MS }); startV = 0 }
    }
    const curAfter = fresh ? startV : value(now)
    if (runT == null) runT = now
    const E = fresh ? base : elapsedAt(now)
    const d = durations[st.index] ?? 0
    const isLast = st.index >= durations.length - 1
    const T = E + rest
    let end = T > 0 ? (E + d) / T : 1
    if (isLast) end = Math.min(end, LAST_CAP)
    end = clamp01(end)
    const to = Math.max(curAfter, end)
    const span = end - (T > 0 ? E / T : 0)
    const ms = to > curAfter && d > 0 ? Math.round(d * Math.min(1, span > 0 ? (to - curAfter) / span : 1)) : 0
    if (to > curAfter) list.push({ to, ms })
    const f = fresh && !seeded ? value(now) : curAfter
    set(now, f, list)
    return { from: f, steps: list }
  }

  return { onState, value, reset() { base = 0; runT = null; last = { status: 'idle', index: 0, run: -1 }; set(0, 0, []) } }
}
