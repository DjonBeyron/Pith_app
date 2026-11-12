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
// Режим «Громче» (v3.3.197, замечание владельца: игра тише, чем может телефон; «просто добавить громкость» возвращает хруст). Измерено на реальной речи (Chromium, OfflineAudioContext, тот же
// DynamicsCompressorNode, что в Safari; пик реплик Пита ≈ −6, RMS ≈ −21 dBFS): текущая цепочка даёт RMS речи −17,8 dBFS при пике −1,1; «просто усилить вдвое» — RMS −11,9, но пики +4,9 dBFS и
// 0,6 % отсчётов обрезано (это и есть хруст); пресет 'loud' — норма до RMS −14, сжатие −28 дБ 4:1 (колено 18), мастер ×1,4 и жёсткий лимитер −3 дБ 20:1 → RMS ≈ −12,6, пик ≈ −0,5, обрезано < 0,01 %.
// 'normal' — как до 3.3.197 (по умолчанию). Режим читается при создании цепочки контекста и при декодировании буфера → менять и перезагружать страницу (Админ → «Голос» → «Громкость на iPhone»).
export const LOUDNESS_KEY = 'pithy_game_loudness_v1'
export const LOUDNESS_MODES = ['normal', 'loud', 'louder', 'max']
export const LOUDNESS_LABELS = { normal: 'Обычная', loud: 'Громче (+5 дБ)', louder: 'Ещё громче (+8 дБ)', max: 'Максимум (+9 дБ, сильное сжатие)' }
export const PRESETS = {
  normal: { maxGain: 4, peakDb: -1, rmsCeilDb: -18, comp: { threshold: -10, ratio: 4, knee: 10, attack: 0.003, release: 0.25 }, master: 1, limiter: null },
  loud: { maxGain: 8, peakDb: -1, rmsCeilDb: -14, comp: { threshold: -28, ratio: 4, knee: 18, attack: 0.008, release: 0.15 }, master: 1.4, limiter: { threshold: -3, ratio: 20, knee: 0, attack: 0.001, release: 0.08 } },
  // v3.3.198 («всё тихо одинаково, даже с закрытым микрофоном» — значит, сами звуки тихие): измерено на тех же 35 словах — louder RMS −9,7 (+8,1 дБ), max RMS −8,5 (+9,3 дБ), обрезано < 0,02 %.
  // shape — мягкий потолок на выходе (WaveShaper tanh(k·x)/tanh(k), oversample 2×), ceil — множитель после него (пики с запасом ниже 0 dBFS); чем сильнее сжатие, тем «радийнее» голос.
  louder: { maxGain: 10, peakDb: -1, rmsCeilDb: -12, comp: { threshold: -30, ratio: 5, knee: 18, attack: 0.006, release: 0.15 }, master: 1.5, limiter: { threshold: -4, ratio: 20, knee: 0, attack: 0.001, release: 0.08 }, shape: 1.15, ceil: 0.94 },
  max: { maxGain: 10, peakDb: -1, rmsCeilDb: -10, comp: { threshold: -32, ratio: 6, knee: 18, attack: 0.005, release: 0.12 }, master: 1.6, limiter: { threshold: -5, ratio: 20, knee: 0, attack: 0.001, release: 0.08 }, shape: 1.4, ceil: 0.94 },
}
export const readLoudness = (store = globalThis.localStorage) => { try { const v = store?.getItem(LOUDNESS_KEY); return LOUDNESS_MODES.includes(v) ? v : 'normal' } catch { return 'normal' } }
export const writeLoudness = (value, store = globalThis.localStorage) => { try { if (LOUDNESS_MODES.includes(value) && value !== 'normal') store?.setItem(LOUDNESS_KEY, value); else store?.removeItem(LOUDNESS_KEY) } catch { /* приватный режим */ } }
const preset = () => PRESETS[readLoudness()]

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
export function gainFor({ peak, rms }, p = preset()) {
  if (!(peak > 1e-4)) return 1
  let g = Math.min(p.maxGain, fromDb(p.peakDb) / peak)
  if (rms > 0) g = Math.min(g, fromDb(p.rmsCeilDb) / rms)
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
      const p = preset()
      const comp = ctx.createDynamicsCompressor()
      for (const [k, v] of Object.entries(p.comp)) { if (comp[k] && 'value' in comp[k]) comp[k].value = v }
      const master = ctx.createGain()
      master.gain.value = p.master
      comp.connect(master)
      let tail = master
      if (p.limiter) { // жёсткий лимитер в конце: пики не вылезают за 0 dBFS, усиление не даёт хруста
        const lim = ctx.createDynamicsCompressor()
        for (const [k, v] of Object.entries(p.limiter)) { if (lim[k] && 'value' in lim[k]) lim[k].value = v }
        master.connect(lim)
        tail = lim
      }
      if (p.shape && typeof ctx.createWaveShaper === 'function') { // мягкий потолок: срезает редкие пики после сжатия, не давая цифрового обрезания
        const ws = ctx.createWaveShaper(), cur = new Float32Array(2048)
        for (let i = 0; i < cur.length; i++) { const v = i / (cur.length - 1) * 2 - 1; cur[i] = Math.tanh(v * p.shape) / Math.tanh(p.shape) }
        ws.curve = cur
        try { ws.oversample = '2x' } catch { /* без oversample */ }
        const ceil = ctx.createGain()
        ceil.gain.value = p.ceil ?? 1
        tail.connect(ws); ws.connect(ceil)
        tail = ceil
      }
      tail.connect(ctx.destination)
      node = comp
    }
  } catch { node = ctx.destination }
  outs.set(ctx, node)
  try { log(`[audio] громкость: сессия ${sessionType()}, мастер-gain ${MASTER_GAIN}, ${node === ctx.destination ? 'без лимитера' : `режим «${readLoudness()}»: сжатие ${preset().comp.threshold} дБ ${preset().comp.ratio}:1 колено ${preset().comp.knee}${preset().limiter ? `, лимитер ${preset().limiter.threshold} дБ` : ''}`}, нормализация до ${PEAK_TARGET_DB} dBFS (≤ ×${MAX_GAIN}, RMS ≤ ${RMS_CEIL_DB}) — ${kind}`) } catch { /* журнал */ }
  return node
}
