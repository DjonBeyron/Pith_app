// Проигрывание готового AudioBuffer через игровой AudioContext (gameAudioCtx.js): AudioBufferSourceNode → GainNode → destination. Старт — source.start(ctx.currentTime): ближайший квант рендера (единицы мс),
// без загрузки, без readyState и без «play() принят, но не заиграл». Громкость — GainNode (у <audio> на iOS volume игнорируется, у Web Audio — работает; можно и выше 1), скорость/тон — playbackRate (тон меняется
// вместе со скоростью: так делают «мяу» трёх тонов; сохранить тон при другой скорости Web Audio не умеет).
//  • playGameBuffer(buffer, { rate, gain, onStart, onResult, onEnd }) → true, если звук принят (стартует сразу или после resume()), false — играть нечем (нет буфера / Web Audio). onStart() — звук ДЕЙСТВИТЕЛЬНО стартовал
//    (синхронно, если контекст 'running'; иначе после resume — до RESUME_WAIT_MS): по нему кот открывает рот. onResult({ play, ms, ctx, error? }) — один раз: play 'started' (ms — через сколько мс с вызова),
//    'ctx-stuck' (контекст не стал 'running' за RESUME_WAIT_MS: прерван / нет жеста — звук НЕ играет, onStart не будет), 'rejected' (исключение Web Audio).
//  • stopGameBuffers() — оборвать всё, что играет (пауза, выход из игры).
import { getGameCtx } from './gameAudioCtx.js'

export const RESUME_WAIT_MS = 300 // сколько ждём resume() контекста, который не 'running' (прервано iOS / ещё не открывали), прежде чем сдаться

const playing = new Set() // { src, gain } — идущие источники

function build(c, buffer, rate, gain) {
  const src = c.createBufferSource()
  src.buffer = buffer
  try { src.playbackRate.value = rate } catch { /* без playbackRate */ }
  const g = c.createGain()
  g.gain.value = gain
  src.connect(g)
  g.connect(c.destination)
  return { src, g }
}

function release(node) {
  playing.delete(node)
  try { node.src.disconnect() } catch { /* уже отключён */ }
  try { node.g.disconnect() } catch { /* уже отключён */ }
}

export function playGameBuffer(buffer, { rate = 1, gain = 1, onStart = null, onResult = null, onEnd = null, now = () => performance.now(), waitMs = RESUME_WAIT_MS, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const c = buffer ? getGameCtx() : null
  if (!c) return false
  const t0 = now()
  const report = (play, extra = {}) => { try { onResult?.({ play, ms: Math.round(now() - t0), ctx: c.state, source: 'buffer', ...extra }) } catch { /* отладка не мешает звуку */ } }
  const begin = () => {
    let node
    try {
      node = build(c, buffer, rate > 0 ? rate : 1, Math.max(0, gain))
      node.src.onended = () => { release(node); try { onEnd?.() } catch { /* подписчик не должен ломать звук */ } }
      node.src.start(c.currentTime || 0)
    } catch (e) { if (node) release(node); report('rejected', { error: e?.name ?? String(e ?? 'error') }); return }
    playing.add(node)
    try { onStart?.() } catch { /* рот кота не должен ломать звук */ }
    report('started')
  }
  if (c.state === 'running') { begin(); return true }
  let settled = false
  const timer = setTimer(() => { if (settled) return; settled = true; report('ctx-stuck', { error: `AudioContext не запущен (${c.state})` }) }, waitMs)
  let p
  try { p = c.resume() } catch { p = null }
  Promise.resolve(p).catch(() => {}).then(() => { if (settled || c.state !== 'running') return; settled = true; clearTimer(timer); begin() })
  return true
}

/** Оборвать все идущие звуки игры (пауза / выход) */
export function stopGameBuffers() {
  for (const node of [...playing]) {
    try { node.src.onended = null; node.src.stop?.() } catch { /* уже закончил */ }
    release(node)
  }
}

/** Сколько звуков идёт сейчас (диагностика, тесты) */
export const playingCount = () => playing.size
