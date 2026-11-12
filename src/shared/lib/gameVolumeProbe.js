// Замер громкости самим телефоном (v3.3.195, журнал владельца: «встряхнуть громкость в игре будто не работает» — по журналу нельзя понять, стало ли громче). Тест-звук играет через игровой
// контекст (тот же путь, что у реплик Пита), а игровой микрофон его слышит: уровень тона над фоном комнаты, в дБ — число, которое можно сравнить ДО и ПОСЛЕ встряски. Разница около 0 дБ — встряска
// ничего не меняет; +3 дБ и больше — громче заметно. Условия: микрофон игры открыт (дорожка на время замера включается и возвращается), игровой контекст running. Эхоподавление микрофона выключено,
// поэтому динамик в микрофоне слышен. Зависимости подставляются (тесты без браузера). Результат — строка «[audio] замер громкости: …» в журнале игры.
import { peekGameMic } from './gameMic.js'
import { peekGameCtx, getGameCtx } from './gameAudioCtx.js'
import { playGameBuffer } from './gameBufferPlay.js'
import { nudgeVolume, testToneBuffer } from './gameVolumeNudge.js'
import { pLog } from './debug.js'

export const ROOM_MS = 400   // сначала слушаем комнату (фон), потом играем тон
export const TONE_MS = 1700  // длина теста-звука 1,5 с + хвост
export const STEP_MS = 40    // как часто снимаем уровень
const db = x => (x > 0 ? 20 * Math.log10(x) : -120)
const r1 = v => Math.round(v * 10) / 10
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0 }

/** Одна проба. → { ok, toneDb, roomDb, overDb } или { ok: false, why } */
export async function measureLoudness(deps = {}) {
  const d = { stream: peekGameMic, ctx: peekGameCtx, ctxMake: getGameCtx, play: b => playGameBuffer(b), sleep: ms => new Promise(r => setTimeout(r, ms)), ...deps }
  const stream = d.stream(), c = d.ctx() ?? d.ctxMake()
  const tracks = stream?.getAudioTracks?.() ?? []
  if (!tracks.length || tracks.every(t => t.readyState !== 'live')) return { ok: false, why: 'микрофон игры не открыт' }
  if (!c || c.state !== 'running') return { ok: false, why: `игровой контекст ${c?.state ?? 'нет'}` }
  const buf = testToneBuffer(c)
  if (!buf) return { ok: false, why: 'нет Web Audio для тест-звука' }
  const was = tracks.map(t => t.enabled)
  tracks.forEach(t => { t.enabled = true })
  let src = null, an = null
  const room = [], tone = []
  try {
    src = c.createMediaStreamSource(stream); an = c.createAnalyser(); an.fftSize = 2048
    src.connect(an)
    const data = new Float32Array(an.fftSize)
    const sample = () => { an.getFloatTimeDomainData(data); let s = 0; for (let i = 0; i < data.length; i++) s += data[i] * data[i]; return Math.sqrt(s / data.length) }
    for (let t = 0; t < ROOM_MS; t += STEP_MS) { await d.sleep(STEP_MS); room.push(sample()) }
    const started = d.play(buf)
    if (!started) return { ok: false, why: 'тест-звук не запустился' }
    for (let t = 0; t < TONE_MS; t += STEP_MS) { await d.sleep(STEP_MS); tone.push(sample()) }
  } catch (e) { return { ok: false, why: `ошибка замера: ${e?.message ?? e}` } } finally {
    try { src?.disconnect() } catch { /* уже отключён */ }
    tracks.forEach((t, i) => { t.enabled = was[i] })
  }
  const roomDb = db(pct(room, 0.5)), toneDb = db(pct(tone, 0.9))
  return { ok: true, toneDb: r1(toneDb), roomDb: r1(roomDb), overDb: r1(toneDb - roomDb) }
}

/** Замер → встряска → замер. → { before, after, diffDb, text }; строка идёт в журнал игры */
export async function measureNudge(how = 'playback', deps = {}) {
  const log = deps.log ?? pLog, sleep = deps.sleep ?? (ms => new Promise(r => setTimeout(r, ms)))
  const tracks = () => peekGameMic()?.getAudioTracks?.() ?? []
  const before = await measureLoudness(deps)
  if (!before.ok) { const text = `замер не вышел: ${before.why}`; try { log(`[audio] замер громкости: ${text}`) } catch { /* журнал не мешает */ } return { before, after: null, diffDb: null, text } }
  await sleep(300)
  const nudge = await nudgeVolume(how, { tracks, ...(deps.nudge ?? {}) })
  await sleep(500) // маршрут вывода успокаивается
  const after = await measureLoudness(deps)
  const diffDb = after.ok ? r1(after.toneDb - before.toneDb) : null
  const text = after.ok
    ? `тон ${before.toneDb} дБ (над фоном ${before.overDb}) → после «${how}» ${after.toneDb} дБ (над фоном ${after.overDb}); разница ${diffDb > 0 ? '+' : ''}${diffDb} дБ — ${Math.abs(diffDb) < 1.5 ? 'встряска ничего не меняет' : diffDb > 0 ? 'ГРОМЧЕ' : 'тише'}; встряска ${nudge.ok ? 'сделана' : 'не вышла'}`
    : `до: тон ${before.toneDb} дБ; после «${how}» замер не вышел: ${after.why}`
  try { log(`[audio] замер громкости (по микрофону): ${text}`) } catch { /* журнал не мешает */ }
  return { before, after, diffDb, text }
}
