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
export const LOUDNESS_MODES = ['normal', 'mid', 'loud', 'louder', 'max', 'cap3', 'cap6']
export const LOUDNESS_LABELS = { normal: 'Обычная (старая)', mid: 'Чуть громче (+3,5 дБ)', loud: 'Громче (+5 дБ)', louder: 'Ещё громче (+8 дБ)', max: 'Максимум (+9 дБ, сильное сжатие)', cap3: 'Громко, потолок −3 дБ (≈ +6 дБ на динамике) — умолчание', cap6: 'Потолок −6 дБ (≈ +5 дБ на динамике)' }
// v3.3.217 (замечание владельца: «не громче нормы, но много низов, пик за −6»): у cap3 61 % энергии ниже 200 Гц (у обычной 42 %) — динамик телефона их не воспроизводит (выше 350 Гц cap3 был лишь +4,4 дБ к обычной, а «+8» — +6,4),
// а низы съедают запас у компрессора и лимитера. eq: срез ниже 300 Гц ПЕРЕД компрессором + подъём «разборчивости» 3 кГц (+6 дБ) после него: низов 22 %, на динамике cap3 ≈ +6,3 дБ при пике ≈ −2,9 dBFS.
// v3.3.218: срез низов стал отдельной настройкой (владелец играл на «Ещё громче» — у неё EQ не было, а низов «всё ещё много»): работает со всеми режимами кроме «Обычной». Значения — частота среза, Гц.
export const LOWCUT_KEY = 'pithy_game_lowcut_v1'
// v3.3.219: срез 400 Гц (12 дБ/окт) оставлял 44 % энергии ниже 350 Гц — владелец: «низа всё ещё есть». Теперь срез в два каскада (24 дБ/окт): 500 Гц оставляет ≈ 20 %, 600 Гц — 10 %, 800 Гц — 3 % (но тише на динамике).
export const LOWCUT_MODES = ['off', '300', '400', '500', '600', '800']
export const DEFAULT_LOWCUT = '500'
export const LOWCUT_LABELS = { off: 'Низы: как есть', 300: 'Срез 300 Гц', 400: 'Срез 400 Гц', 500: 'Срез 500 Гц (умолчание)', 600: 'Срез 600 Гц (сухо)', 800: 'Срез 800 Гц (очень тонко)' }
export const readLowCut = (store = globalThis.localStorage) => { try { const v = store?.getItem(LOWCUT_KEY); return LOWCUT_MODES.includes(v) ? v : DEFAULT_LOWCUT } catch { return DEFAULT_LOWCUT } }
export const writeLowCut = (value, store = globalThis.localStorage) => { try { if (LOWCUT_MODES.includes(value)) store?.setItem(LOWCUT_KEY, value) } catch { /* ниже проверим чтением */ } return readLowCut(store) === value }
/** EQ для пресета: срез низов перед компрессором + подъём разборчивости 3 кГц (+4 дБ) после мастера; null — без EQ («Обычная» или срез выключен) */
export const eqFor = (p, store = globalThis.localStorage) => { const cut = readLowCut(store); return p === PRESETS.normal || cut === 'off' ? null : { hp: Number(cut), pres: { f: 3000, q: 0.7, g: 4 } } }
export const PRESETS = {
  normal: { maxGain: 4, peakDb: -1, rmsCeilDb: -18, comp: { threshold: -10, ratio: 4, knee: 10, attack: 0.003, release: 0.25 }, master: 1, limiter: null },
  // v3.3.212 («Пит ≈ на 30 % тише Telegram» при уже исправленной сессии playback): замер на тех же 35 словах — RMS речи −14,1 dBFS (+3,7 дБ к обычной −17,8), пик −0,4, обрезанных отсчётов 0
  mid: { maxGain: 8, peakDb: -1, rmsCeilDb: -15.5, comp: { threshold: -20, ratio: 3, knee: 14, attack: 0.005, release: 0.2 }, master: 1.15, limiter: { threshold: -2, ratio: 20, knee: 0, attack: 0.001, release: 0.08 } },
  loud: { maxGain: 8, peakDb: -1, rmsCeilDb: -14, comp: { threshold: -28, ratio: 4, knee: 18, attack: 0.008, release: 0.15 }, master: 1.4, limiter: { threshold: -3, ratio: 20, knee: 0, attack: 0.001, release: 0.08 } },
  // v3.3.198 («всё тихо одинаково, даже с закрытым микрофоном» — значит, сами звуки тихие): измерено на тех же 35 словах — louder RMS −9,7 (+8,1 дБ), max RMS −8,5 (+9,3 дБ), обрезано < 0,02 %.
  // shape — мягкий потолок на выходе (WaveShaper tanh(k·x)/tanh(k), oversample 2×), ceil — множитель после него (пики с запасом ниже 0 dBFS); чем сильнее сжатие, тем «радийнее» голос.
  louder: { maxGain: 10, peakDb: -1, rmsCeilDb: -12, comp: { threshold: -30, ratio: 5, knee: 18, attack: 0.006, release: 0.15 }, master: 1.5, limiter: { threshold: -4, ratio: 20, knee: 0, attack: 0.001, release: 0.08 }, shape: 1.15, ceil: 0.94 },
  max: { maxGain: 10, peakDb: -1, rmsCeilDb: -10, comp: { threshold: -32, ratio: 6, knee: 18, attack: 0.005, release: 0.12 }, master: 1.6, limiter: { threshold: -5, ratio: 20, knee: 0, attack: 0.001, release: 0.08 }, shape: 1.4, ceil: 0.94 },
  // v3.3.215 (замер на тех же 35 словах, Chromium OfflineAudioContext): «потолок» — пики не выше заданного уровня. v3.3.217 с EQ_PHONE (выше 350 Гц, как слышит динамик телефона): cap3 −11,2 (обычная −17,5), пик −2,9, низов 22 % вместо 61 %; cap6 −12,8, пик ≈ −5,5…−6 (ceil 0,42: передискретизация WaveShaper даёт ≈ +1,5 дБ над расчётным).
  // Громкость и потолок пиков связаны: у louder (+8) пик −0,3 dBFS; чтобы пик был ≤ −6, речь не может быть громче ≈ +5 дБ. Сильное сжатие (12–16:1) + лимитер ниже потолка + WaveShaper + ceil (множитель после него) держат потолок.
  cap3: { maxGain: 10, peakDb: -1, rmsCeilDb: -9, comp: { threshold: -42, ratio: 12, knee: 8, attack: 0.003, release: 0.1 }, master: 4.0, limiter: { threshold: -6, ratio: 20, knee: 0, attack: 0.001, release: 0.08 }, shape: 1.4, ceil: 0.63 },
  cap6: { maxGain: 10, peakDb: -1, rmsCeilDb: -8, comp: { threshold: -46, ratio: 16, knee: 6, attack: 0.002, release: 0.1 }, master: 5.5, limiter: { threshold: -8, ratio: 20, knee: 0, attack: 0.001, release: 0.08 }, shape: 1.6, ceil: 0.42 },
}
export const DEFAULT_LOUDNESS = 'cap3' // v3.3.215: «+8 дБ нравится, но пики вылезают за границы, а +5 маловато» → громко, но с настоящим потолком пиков −3 дБFS (3.3.213 был 'max'); 'normal' — прежняя цепочка (до 3.3.197)
export const readLoudness = (store = globalThis.localStorage) => { try { const v = store?.getItem(LOUDNESS_KEY); return LOUDNESS_MODES.includes(v) ? v : DEFAULT_LOUDNESS } catch { return DEFAULT_LOUDNESS } }
/** Сохранить режим. → true, только если он ПРОЧИТАЛСЯ обратно (v3.3.214: на iPhone при переполненном хранилище setItem молча падал, и выбор «не держался»). Не влезло — освобождаем место (сохранённый прогон громкости) и пробуем ещё раз */
export const writeLoudness = (value, store = globalThis.localStorage) => {
  const put = () => { try { if (LOUDNESS_MODES.includes(value)) store?.setItem(LOUDNESS_KEY, value); else store?.removeItem(LOUDNESS_KEY) } catch { /* ниже проверим чтением */ } return readLoudness(store) === (LOUDNESS_MODES.includes(value) ? value : DEFAULT_LOUDNESS) }
  if (put()) return true
  try { store?.removeItem('pithy_volume_run_v5') } catch { /* нечего освобождать */ }
  return put()
}
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
      let tail = master, input = comp
      const eq = eqFor(p)
      if (eq && typeof ctx.createBiquadFilter === 'function') { // срез низов перед компрессором, подъём разборчивости после него (eqFor)
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = eq.hp; hp.Q.value = 0.707
        const hp2 = ctx.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = eq.hp; hp2.Q.value = 0.707 // второй каскад: 24 дБ/окт
        hp.connect(hp2); hp2.connect(comp); input = hp
        const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = eq.pres.f; pk.Q.value = eq.pres.q; pk.gain.value = eq.pres.g
        master.connect(pk); tail = pk
      }
      if (p.limiter) { // жёсткий лимитер в конце: пики не вылезают за 0 dBFS, усиление не даёт хруста
        const lim = ctx.createDynamicsCompressor()
        for (const [k, v] of Object.entries(p.limiter)) { if (lim[k] && 'value' in lim[k]) lim[k].value = v }
        tail.connect(lim)
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
      node = input
    }
  } catch { node = ctx.destination }
  outs.set(ctx, node)
  try { log(`[audio] громкость: сессия ${sessionType()}, мастер-gain ${MASTER_GAIN}, ${node === ctx.destination ? 'без лимитера' : `режим «${readLoudness()}»: сжатие ${preset().comp.threshold} дБ ${preset().comp.ratio}:1 колено ${preset().comp.knee}${preset().limiter ? `, лимитер ${preset().limiter.threshold} дБ` : ''}, срез низов ${eqFor(preset())?.hp ?? 'нет'}${eqFor(preset()) ? ' Гц' : ''}`}, нормализация до ${PEAK_TARGET_DB} dBFS (≤ ×${MAX_GAIN}, RMS ≤ ${RMS_CEIL_DB}) — ${kind}`) } catch { /* журнал */ }
  return node
}
