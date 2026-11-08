// Громкость звуков игры и интерфейса (замечание владельца с iPhone, v3.3.165: «вся игра очень тихая по сравнению с другими приложениями»). Две части:
//  • нормализация при декодировании: буфер умножается так, чтобы пик стал PEAK_TARGET_DB (−1 dBFS), но не больше чем ×MAX_GAIN (4) и не громче RMS_CEIL_DB (−18 dBFS по звучащим окнам):
//    потолок по RMS нужен, чтобы синусы (ноты, «мяу», плашка — у них пик близко к RMS) не стали на 8–10 дБ громче речи Пита (у речи пик выше RMS на ~18 дБ). Тише буфер не делаем никогда (×1 — оставляем как есть);
//  • общий выход контекста (outputOf): мягкий лимитер DynamicsCompressorNode (−10 дБ, 4:1, колено 10) → мастер-GainNode → destination — наложение реплики и ноты не клипает.
// Замер (Chromium, decodeAudioData, v3.3.165): реплика Пита ElevenLabs пик −3,9 / RMS −22,4 dBFS; звуки интерфейса pin-message −27,9 / −41, typing-2 −26 / −38, message-in −16,6 / −30,5; мяу −21 / −28; плашка −18 / −28; нота награды −12 / −22.
// Журнал (pLog): «[audio] громкость: сессия <тип>, мастер-gain X, нормализация ×Y для «id» (peak −N dBFS)» — один раз на буфер; строка выхода — один раз на контекст.
// shared/lib фич не импортирует; чистая часть (gainFor, levelsOf) проверяется тестами без браузера.
import { pLog } from './debug.js'

export const PEAK_TARGET_DB = -1
export const MAX_GAIN = 4
export const RMS_CEIL_DB = -18
export const MASTER_GAIN = 1
export const LIMITER = { threshold: -10, ratio: 4, knee: 10, attack: 0.003, release: 0.25 }
const VOICED_WIN_S = 0.02
const VOICED_MIN = 0.003 // окно тише −50 dBFS — тишина, в RMS не идёт

const dbOf = x => (x > 0 ? 20 * Math.log10(x) : -Infinity)
const fromDb = db => 10 ** (db / 20)
export const fmtDb = x => (x > 0 ? dbOf(x).toFixed(1).replace('-', '−') : '−∞')

/** Пик и RMS звучащих окон по каналам (Float32Array[]) → { peak, rms } в долях шкалы */
export function levelsOf(channels, rate = 44100) {
  let peak = 0, vs = 0, vn = 0
  const win = Math.max(1, Math.round(rate * VOICED_WIN_S))
  for (const ch of channels ?? []) {
    for (let i = 0; i < ch.length; i += win) {
      let w = 0
      const to = Math.min(ch.length, i + win)
      for (let j = i; j < to; j++) { const v = ch[j]; const a = v < 0 ? -v : v; if (a > peak) peak = a; w += v * v }
      if (Math.sqrt(w / (to - i)) > VOICED_MIN) { vs += w; vn += to - i }
    }
  }
  return { peak, rms: vn ? Math.sqrt(vs / vn) : 0 }
}

/** Множитель нормализации: пик → −1 dBFS, не больше ×4, RMS не выше −18 dBFS; тихо (пик ≈ 0) или уже громко — 1 */
export function gainFor({ peak, rms }) {
  if (!(peak > 1e-4)) return 1
  let g = Math.min(MAX_GAIN, fromDb(PEAK_TARGET_DB) / peak)
  if (rms > 0) g = Math.min(g, fromDb(RMS_CEIL_DB) / rms)
  return g > 1.01 ? g : 1
}

export const sessionType = () => { try { return globalThis.navigator?.audioSession?.type ?? 'нет API' } catch { return 'нет API' } }

const done = new WeakSet()

/** Нормализовать декодированный AudioBuffer НА МЕСТЕ (один раз на буфер). id — имя для журнала. → множитель (1 — не меняли) */
export function normalizeBuffer(buffer, id = '', { log = pLog } = {}) {
  if (!buffer || typeof buffer.getChannelData !== 'function' || done.has(buffer)) return 1
  done.add(buffer)
  const chs = Array.from({ length: buffer.numberOfChannels || 1 }, (_, c) => buffer.getChannelData(c))
  const lv = levelsOf(chs, buffer.sampleRate)
  const g = gainFor(lv)
  if (g > 1) for (const ch of chs) for (let i = 0; i < ch.length; i++) ch[i] *= g
  try { log(`[audio] громкость: сессия ${sessionType()}, мастер-gain ${MASTER_GAIN}, нормализация ×${g.toFixed(2)} для «${id}» (peak ${fmtDb(lv.peak)} dBFS, RMS ${fmtDb(lv.rms)} dBFS)`) } catch { /* журнал не мешает звуку */ }
  return g
}

/** Короткое имя звука для журнала: последняя часть адреса без параметров */
export const idOfUrl = url => { const s = String(url ?? '').split('?')[0]; return decodeURIComponent(s.slice(s.lastIndexOf('/') + 1)) || s }

const outs = new WeakMap() // контекст → узел, к которому подключать звуки

/** Вход общей цепочки контекста: лимитер → мастер-gain → destination (создаётся один раз на контекст). Нет DynamicsCompressor (тесты, старый браузер) — destination */
export function outputOf(ctx, { kind = 'игра', log = pLog } = {}) {
  if (!ctx) return null
  const have = outs.get(ctx)
  if (have) return have
  let node = ctx.destination
  try {
    if (typeof ctx.createDynamicsCompressor === 'function' && typeof ctx.createGain === 'function') {
      const comp = ctx.createDynamicsCompressor()
      for (const [k, v] of Object.entries(LIMITER)) { if (comp[k] && 'value' in comp[k]) comp[k].value = v }
      const master = ctx.createGain()
      master.gain.value = MASTER_GAIN
      comp.connect(master)
      master.connect(ctx.destination)
      node = comp
    }
  } catch { node = ctx.destination }
  outs.set(ctx, node)
  try { log(`[audio] громкость: сессия ${sessionType()}, мастер-gain ${MASTER_GAIN}, ${node === ctx.destination ? 'без лимитера' : `лимитер ${LIMITER.threshold} дБ ${LIMITER.ratio}:1 колено ${LIMITER.knee}`}, нормализация до ${PEAK_TARGET_DB} dBFS (≤ ×${MAX_GAIN}, RMS ≤ ${RMS_CEIL_DB}) — ${kind}`) } catch { /* журнал */ }
  return node
}
