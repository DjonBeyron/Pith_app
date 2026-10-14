import { sha256Hex } from '../../../shared/lib/sha256.js'
import { isObj } from './sceneConstants.js'

// Озвучка реплик ElevenLabs — схемная часть (без сети и без React): какой голос у
// персонажа (voiceSpec), hash озвучки (text + голос + настройки + модель), статус
// реплики (нет файла / озвучена / устарела), проверка адреса файла на домене R2,
// тайминги слов из ответа TTS. Генерацией занимается сборщик (admin/scenes/voice/),
// воспроизведением — audioLine.js; здесь только чистые функции, общие для них и линтера.
//
// Поля реплики (все необязательные, версия формата остаётся 2):
//   audioUrl    — https-адрес mp3 в R2 (…r2.dev) — ставит ТОЛЬКО сборщик, не нейросеть
//   wordTimings — [{ word, start, end }] секунды с округлением до сотых, по возрастанию
//   audioMeta   — { hash: sha-256 hex, voiceId, durationMs? } — чтобы заметить, что текст
//                 или голос поменяли после генерации (hash не сходится → «устарело»), и
//                 не генерировать повторно то, что уже есть (одинаковый hash → тот же файл)

export const TTS_MODEL = 'eleven_multilingual_v2'
// 'default' — голос из серверного секрета ELEVENLABS_VOICE_ID (voiceId у персонажа пуст)
export const DEFAULT_VOICE_ID = 'default'
export const VOICE_RANGE = { stability: [0, 1], similarity: [0, 1], speed: [0.7, 1.2] }
export const VOICE_DEFAULTS = { stability: 0.5, similarity: 0.75, speed: 1 }
// Слов в реплике ≤ 140 символов больше 70 не бывает; потолок с запасом держит размер сцены
export const MAX_WORD_TIMINGS = 80
export const HASH_RE = /^[0-9a-f]{64}$/
// Публичные домены файлов проекта: бакет pithy-files через pub-….r2.dev (см. CSP в vercel.json)
// и собственный CDN-домен media.<домен> (CLOUDFLARE_SETUP.md). Другой домен — добавить сюда одной строкой
export const AUDIO_HOSTS = [/(^|\.)r2\.dev$/i, /^media\.[a-z0-9-]+(\.[a-z0-9-]+)+$/i]

const num = (v, [lo, hi], dflt) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt)
const r2 = v => Math.round(v * 100) / 100

// Голос персонажа в том виде, в каком он уходит в TTS и в hash
export function voiceSpec(character) {
  const v = isObj(character?.voice) ? character.voice : {}
  const voiceId = typeof v.voiceId === 'string' && v.voiceId.trim() ? v.voiceId.trim() : DEFAULT_VOICE_ID
  return {
    voiceId,
    stability: num(v.stability, VOICE_RANGE.stability, VOICE_DEFAULTS.stability),
    similarity: num(v.similarity, VOICE_RANGE.similarity, VOICE_DEFAULTS.similarity),
    speed: num(v.speed, VOICE_RANGE.speed, VOICE_DEFAULTS.speed),
    model: TTS_MODEL,
  }
}

// Один и тот же текст тем же голосом с теми же настройками → тот же hash
export function audioHash(text, spec) {
  const s = spec ?? voiceSpec(null)
  return sha256Hex(JSON.stringify([String(text ?? '').trim(), s.voiceId, s.stability, s.similarity, s.speed, s.model]))
}

// 'none' — файла нет; 'ready' — файл есть и hash совпадает (или у старого файла нет
// audioMeta — считаем актуальным, переозвучить можно вручную); 'stale' — текст/голос
// поменяли после генерации
export function lineAudioState(line, character) {
  if (!line?.audioUrl) return 'none'
  const hash = line.audioMeta?.hash
  if (!hash) return 'ready'
  return hash === audioHash(line.text, voiceSpec(character)) ? 'ready' : 'stale'
}

export function sceneVoiceStats(scene) {
  const tl = Array.isArray(scene?.timeline) ? scene.timeline : []
  const out = { total: tl.length, ready: 0, stale: 0, none: 0 }
  for (const l of tl) out[lineAudioState(l, scene?.characters?.[l?.who])] += 1
  return out
}

export function isSceneAudioUrl(url) {
  if (typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && AUDIO_HOSTS.some(re => re.test(u.hostname))
  } catch { return false }
}

// Ответ tts-elevenlabs [{ w, t, e? }] → [{ word, start, end }] (сотые секунды, end ≥ start,
// без e — конец слова = начало следующего, последнее — до конца файла или +0.4 с)
export function timingsFromTts(words, durationSec = null) {
  const src = Array.isArray(words) ? words.filter(w => isObj(w) && typeof w.t === 'number') : []
  return src.map((w, i) => {
    const start = r2(w.t)
    const next = src[i + 1]?.t
    let end = typeof w.e === 'number' ? w.e : (typeof next === 'number' ? next : (durationSec ?? w.t + 0.4))
    end = r2(Math.max(start, end))
    return { word: String(w.w ?? ''), start, end }
  })
}

export function durationMsFromTimings(timings, durationSec = null) {
  if (typeof durationSec === 'number' && Number.isFinite(durationSec) && durationSec > 0) return Math.round(durationSec * 1000)
  const last = Array.isArray(timings) && timings.length ? timings[timings.length - 1] : null
  return last && typeof last.end === 'number' ? Math.round(last.end * 1000) : null
}

// Поля озвучки, которые надо снять с реплики («Удалить озвучку»)
export const AUDIO_FIELDS = ['audioUrl', 'wordTimings', 'audioMeta']
