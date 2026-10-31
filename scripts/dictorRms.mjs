// Громкость звука в записи отладки «Повтори за диктором» — по окнам речи диктора и Пита (для scripts/dictor-debug-report.mjs). Зачем: на iPhone жалоба «то громче, то тише» (ducking аудиосессии) —
// самого воспроизведения без Web Audio (AnalyserNode на iOS ломает звук) не измерить, зато динамик слышен в записи микрофона: если громкость плывёт, это видно как разброс RMS по окнам речи
// и как спад/рост внутри окна. Чистые функции (без файлов и ffmpeg) — проверяются тестом; декодирование записи — decodeWithFfmpeg (нужен ffmpeg в PATH, иначе null).
// Окна берутся из событий пробника: <audio> звучит от playing до ended/pause/error (play-call — запасной старт), синтез речи — от speech-event start до end/error. Время событий t — мс от старта игры.
import { spawnSync } from 'node:child_process'

export const RATE = 16000
export const STEP_MS = 100

/** События пробника → окна речи [{ from, to, kind: 'audio'|'speech', src, note, stage }] по времени. note — ближайшая заметка игры (dictor / word / cat:… / note) в пределах окна, stage — стадия на момент старта */
export function speechWindows(events) {
  const list = events.filter(e => e.type === 'probe' || e.type === 'note' || e.type === 'stage').sort((a, b) => a.t - b.t)
  const open = new Map()
  const out = []
  const stageAt = t => events.filter(e => e.type === 'stage' && e.t <= t).at(-1)?.kind ?? ''
  const noteNear = (from, to) => events.filter(e => e.type === 'note' && e.t >= from - 400 && e.t <= to).at(-1)?.kind ?? ''
  const close = (key, t) => {
    const w = open.get(key)
    if (!w) return
    open.delete(key)
    if (t > w.from) out.push({ ...w, to: t, note: noteNear(w.from, t), stage: stageAt(w.from) })
  }
  for (const e of list) {
    if (e.type !== 'probe') continue
    if (e.kind === 'playing') { close(`a${e.el}`, e.t); open.set(`a${e.el}`, { from: e.t, kind: 'audio', src: e.src ?? '' }) }
    else if (e.kind === 'ended' || e.kind === 'pause' || e.kind === 'media-error') close(`a${e.el}`, e.t)
    else if (e.kind === 'speech-event' && e.event === 'start') open.set(`s${e.id}`, { from: e.t, kind: 'speech', src: 'speechSynthesis' })
    else if (e.kind === 'speech-event') close(`s${e.id}`, e.t)
  }
  const last = list.at(-1)?.t ?? 0
  for (const key of [...open.keys()]) close(key, last) // не закрылось — до конца журнала
  return out.sort((a, b) => a.from - b.from)
}

/** RMS кусками по stepMs: Float32Array отсчётов → массив RMS (0..1) */
export function rmsSeries(samples, rate = RATE, stepMs = STEP_MS) {
  const n = Math.max(1, Math.round((rate * stepMs) / 1000))
  const out = []
  for (let i = 0; i + n <= samples.length; i += n) {
    let sum = 0
    for (let k = i; k < i + n; k++) sum += samples[k] * samples[k]
    out.push(Math.sqrt(sum / n))
  }
  return out
}

export const toDb = v => (v > 1e-5 ? 20 * Math.log10(v) : -100)
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0)

/**
 * RMS записи по каждому окну речи. startRel — когда началась запись (мс от старта игры). → [{ ...окно, series (RMS по 100 мс), meanDb, peakDb, trendDb (последняя треть минус первая) }];
 * окна вне записи пропускаются. Громкие 100-мс отрезки — это речь динамика в микрофон; «ровно тихо» (< -60 дБ) — динамик не слышен вовсе (или дорожка выключена режимом «глушить»).
 */
export function windowLevels(windows, rmsAll, startRel, stepMs = STEP_MS) {
  const out = []
  for (const w of windows) {
    const a = Math.floor((w.from - startRel) / stepMs)
    const b = Math.ceil((w.to - startRel) / stepMs)
    if (b <= 0 || a >= rmsAll.length) continue
    const series = rmsAll.slice(Math.max(0, a), Math.min(rmsAll.length, b))
    if (!series.length) continue
    const db = series.map(toDb)
    const third = Math.max(1, Math.floor(db.length / 3))
    out.push({ ...w, series, meanDb: toDb(Math.sqrt(mean(series.map(v => v * v)))), peakDb: Math.max(...db), trendDb: db.length >= 3 ? mean(db.slice(-third)) - mean(db.slice(0, third)) : 0 })
  }
  return out
}

/** Сводка по событиям audio-tick (раз в 500 мс, пока играет звук): сколько тиков, какие тип аудиосессии, видимость, громкость <audio> встречались и когда тип менялся */
export function tickSummary(events) {
  const ticks = events.filter(e => e.type === 'probe' && e.kind === 'audio-tick').sort((a, b) => a.t - b.t)
  const count = (arr) => arr.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map())
  const changes = []
  let prev
  for (const t of ticks) { if (t.as !== prev) { changes.push({ t: t.t, as: t.as }); prev = t.as } }
  return {
    ticks: ticks.length,
    sessionTypes: Object.fromEntries(count(ticks.map(t => t.as ?? 'нет API'))),
    visibility: Object.fromEntries(count(ticks.map(t => t.vis ?? '?'))),
    volumes: Object.fromEntries(count(ticks.flatMap(t => (t.els ?? []).map(x => x.vol)))),
    sessionChanges: changes,
  }
}

/** Запись (путь к файлу webm/m4a) → Float32Array моно 16 кГц или null (нет ffmpeg / не декодировалось) */
export function decodeWithFfmpeg(path) {
  try {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-'], { maxBuffer: 1 << 29 })
    if (r.error || r.status !== 0 || !r.stdout?.length) return null
    const b = r.stdout
    return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length - (b.length % 4)))
  } catch { return null }
}
