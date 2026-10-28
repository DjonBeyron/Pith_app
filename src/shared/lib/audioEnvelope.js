// Огибающая громкости реплики, посчитанная ЗАРАНЕЕ (при озвучке в сборщике сцен), — чтобы рот Пита в плеере двигался «по громкости» без разбора звука на лету.
//
// НЕ Web Audio на живом <audio> (AnalyserNode на iOS уводит вывод в soloAmbient — см. audioSpectrum.js, audioLevel.js): файл один раз декодируется
// OfflineAudioContext (он не трогает аудиосессию), берётся RMS по окнам 1/hz секунды и нормируется к самому громкому окну реплики.
// Формат (его пишет сборщик в audioMeta.env реплики): { hz: 20, data: '0123ff…' } — одна 16-ричная цифра (0…f = 0…15) на окно, то есть
// ≈ 20 символов на секунду речи: реплика в 4 с — 80 байт, в 10 с — 200 байт (в JSON сцены, ≤ 64 КБ). Читает рот — mouthVisemes.js / mouthSync.js.
// shared/lib фич не импортирует; чистая часть (envelopeFromSamples и ниже) проверяется тестами без браузера.

export const ENV_HZ = 20
export const ENV_MAX = 15            // верхняя ступень шкалы (одна hex-цифра)
export const ENV_MAX_SEC = 60        // длиннее реплик не бывает; потолок держит размер сцены
const DECODE_RATE = 22050

// Моно-сэмплы → { hz, data }: RMS окна / RMS самого громкого окна, округлено до 0…15; тишина (пик ≈ 0) — одни нули
export function envelopeFromSamples(samples, sampleRate, hz = ENV_HZ) {
  const n = samples?.length ?? 0
  if (!n || !(sampleRate > 0) || !(hz > 0)) return { hz, data: '' }
  const hop = sampleRate / hz
  const windows = Math.min(Math.ceil(n / hop), Math.ceil(ENV_MAX_SEC * hz))
  const rms = new Float32Array(windows)
  let peak = 0
  for (let w = 0; w < windows; w++) {
    const from = Math.round(w * hop)
    const to = Math.min(n, Math.round((w + 1) * hop))
    let sum = 0
    for (let i = from; i < to; i++) sum += samples[i] * samples[i]
    rms[w] = to > from ? Math.sqrt(sum / (to - from)) : 0
    if (rms[w] > peak) peak = rms[w]
  }
  let data = ''
  for (let w = 0; w < windows; w++) data += (peak > 1e-5 ? Math.round((rms[w] / peak) * ENV_MAX) : 0).toString(16)
  return { hz, data }
}

// Файл (ArrayBuffer mp3/wav) → { hz, data }. Бросает ошибку, если браузер не умеет OfflineAudioContext или файл не декодируется
export async function computeEnvelope(arrayBuffer, { hz = ENV_HZ } = {}) {
  const Ctx = globalThis.OfflineAudioContext ?? globalThis.webkitOfflineAudioContext
  if (!Ctx) throw new Error('браузер не умеет разбирать звук (OfflineAudioContext)')
  const audio = await new Ctx(1, 1, DECODE_RATE).decodeAudioData(arrayBuffer)
  return envelopeFromSamples(audio.getChannelData(0), audio.sampleRate, hz)
}

// Годится ли env из JSON сцены: { hz: целое 1…100, data: 16-ричные цифры, не длиннее ENV_MAX_SEC секунд }
export function validEnvelope(env) {
  return !!env && typeof env === 'object' && Number.isInteger(env.hz) && env.hz >= 1 && env.hz <= 100
    && typeof env.data === 'string' && env.data.length > 0 && env.data.length <= ENV_MAX_SEC * env.hz && /^[0-9a-f]+$/.test(env.data)
}

// env → { hz, levels: Float32Array 0…1 } для опроса по времени (разбор один раз на реплику); негодная — null
export function envelopeLevels(env) {
  if (!validEnvelope(env)) return null
  const levels = new Float32Array(env.data.length)
  for (let i = 0; i < levels.length; i++) levels[i] = parseInt(env.data[i], 16) / ENV_MAX
  return { hz: env.hz, levels }
}

// Громкость в момент t (с), 0…1: линейно между центрами окон; за краями — крайние значения, пустая — 0
export function levelAt(lv, t) {
  const a = lv?.levels
  if (!a?.length || !Number.isFinite(t)) return 0
  const pos = Math.max(0, Math.min(a.length - 1, t * lv.hz - 0.5))
  const i = Math.floor(pos)
  const j = Math.min(a.length - 1, i + 1)
  return a[i] + (a[j] - a[i]) * (pos - i)
}
