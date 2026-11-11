// Манифест и части архива «Записи набора» (v3.3.188, CONCEPT_VOICESET.md). Архив — ZIP: manifest.json + clips/NNN_word_variant_rep.wav. Больше PART_MAX — набор делится на части «часть 1 из N»:
// каждая — самостоятельный ZIP со своим манифестом (в нём только её клипы, part / parts и общее число клипов набора). Чистые функции: звук здесь не читается, размеры — из записей клипов.
import { zipSize } from './voiceSetZip.js'

export const PART_MAX = 20 * 1048576
export const MANIFEST_ROOM = 262144 // запас на manifest.json в части

const pad = n => String(n).padStart(2, '0')
export const stamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`
/** pithy-voiceset-2026-11-11_14-05.zip либо …-part1of2.zip */
export const archiveName = (date, part = 1, parts = 1) => `pithy-voiceset-${stamp(date)}${parts > 1 ? `-part${part}of${parts}` : ''}.zip`

/** Запись клипа для манифеста из задания сценария и чисел клипа: слово — word, фраза — phrase, остальное — id */
export function clipEntry(item, stats, { srcRate, sampleRate, preMs, bytes, clipped = 0, t = Date.now() }) {
  return {
    i: item.i, file: item.file, kind: item.kind, ...(item.kind === 'word' ? { word: item.text } : item.kind === 'phrase' ? { phrase: item.text } : { id: item.id }),
    variant: item.variant, rep: item.rep, far: !!item.far, expect: item.expect, hint: item.hint || undefined,
    ms: stats.ms, preMs, sampleRate, srcRate, bytes, rmsPeak: stats.rmsPeak, rmsNoise: stats.rmsNoise, gamePeak: stats.gamePeak, gameNoise: stats.gameNoise,
    voiceMs: stats.voiceMs, voiceOnMs: stats.voiceOnMs, voiceOffMs: stats.voiceOffMs,
    ...(stats.noVoice && item.voiced ? { noVoice: true } : {}), ...(stats.late && item.voiced ? { late: true } : {}), ...(stats.early && item.voiced ? { early: true } : {}),
    ...(stats.zeros ? { zeros: stats.zeros } : {}), ...(clipped ? { clipped } : {}), t: new Date(t).toISOString(),
  }
}

/** Клипы (по порядку сценария) → части: [[клип, …], …], каждая не больше max байт архива (один клип больше max — отдельной частью) */
export function splitParts(clips, max = PART_MAX) {
  const parts = []
  let cur = [], size = 0
  for (const c of [...clips].sort((a, b) => a.i - b.i)) {
    const add = zipSize([{ name: c.file, size: c.bytes }]) - 22
    if (cur.length && size + add > max - MANIFEST_ROOM) { parts.push(cur); cur = []; size = 0 }
    cur.push(c); size += add
  }
  if (cur.length) parts.push(cur)
  return parts
}

/** manifest.json части: meta — { version, ua, device, createdAt, settings, micGain, constraints, captures: [{ t, ctxRate, track }], skipped, planCount } */
export function buildManifest({ meta, clips, part = 1, parts = 1, total = clips.length, now = new Date() }) {
  const last = meta.captures?.at(-1) ?? {}
  return {
    kind: 'pithy-voiceset', v: 1, version: meta.version, device: meta.device, ua: meta.ua, createdAt: meta.createdAt, exportedAt: now.toISOString(),
    part, parts, clipsInSet: total, planCount: meta.planCount, skipped: meta.skipped ?? [], settings: meta.settings,
    audio: { format: 'WAV PCM 16 бит моно', sampleRate: clips[0]?.sampleRate ?? null, contextRate: last.ctxRate ?? null, preMs: clips[0]?.preMs ?? null, micGain: meta.micGain ?? null, note: 'rmsPeak / rmsNoise — сырой поток (лежит в WAV), gamePeak / gameNoise / voiceMs — после «Чувствительности микрофона» игры (это видит слушатель); автоусиление voskAgc к записи не применялось' },
    constraints: meta.constraints ?? null, track: last.track ?? null, captures: meta.captures ?? [],
    clips,
  }
}
