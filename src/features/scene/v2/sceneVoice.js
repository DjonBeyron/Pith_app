import { isObj } from './sceneConstants.js'
import { TTS_MODEL, DEFAULT_VOICE_ID, VOICE_RANGE, VOICE_DEFAULTS, voiceSpec, translationVoiceSpec, audioHash } from './sceneVoiceSpec.js'
import { segmentsLineState } from './sceneSegmentsVoice.js'
import { hasVarParts } from './sceneVarsSegments.js'

export { TTS_MODEL, DEFAULT_VOICE_ID, VOICE_RANGE, VOICE_DEFAULTS, voiceSpec, translationVoiceSpec, audioHash }

const r2 = v => Math.round(v * 100) / 100
const str = v => (typeof v === 'string' && v.trim() ? v.trim() : null)

// Озвучка реплик ElevenLabs — схемная часть (без сети и без React): какой голос у
// персонажа (voiceSpec), hash озвучки (text + голос + настройки + модель), статус
// реплики (нет файла / озвучена / устарела), проверка адреса файла на домене R2,
// тайминги слов из ответа TTS. Генерацией занимается сборщик (admin/scenes/voice/),
// воспроизведением — audioLine.js; здесь только чистые функции, общие для них и линтера.
//
// Поля реплики (все необязательные, версия формата остаётся 2):
//   audioUrl    — https-адрес mp3 в R2 (…r2.dev) — ставит ТОЛЬКО сборщик, не нейросеть
//   wordTimings — [{ word, start, end }] секунды с округлением до сотых, по возрастанию
//   audioMeta   — { hash: sha-256 hex, voiceId, durationMs?, env? } — hash нужен, чтобы заметить, что текст или голос поменяли после генерации
//                 (hash не сходится → «устарело»), и не генерировать повторно то, что уже есть (одинаковый hash → тот же файл);
//                 env — { hz: 20, data: '0a4f…' }: огибающая громкости, посчитанная при озвучке (shared/lib/audioEnvelope.js, одна hex-цифра
//                 0…f на окно 1/hz с), для рта «живого Пита v2» (animV2); нет — рот идёт только по буквам
//   translationAudioUrl / translationWordTimings / translationAudioMeta — тот же комплект для
//                 озвучки ПЕРЕВОДА (translation): hash = sha-256 от translation.trim() + голос
//                 перевода (translationVoiceSpec) + модель. Голос перевода: voice.translationVoiceId
//                 персонажа → options.translationVoiceId сцены → 'default' (голос проекта);
//                 stability/similarity/speed общие с голосом персонажа.

// Слов в реплике ≤ 140 символов больше 70 не бывает; потолок с запасом держит размер сцены
export const MAX_WORD_TIMINGS = 80
export const HASH_RE = /^[0-9a-f]{64}$/
// Публичные домены файлов проекта: бакет pithy-files через pub-….r2.dev (см. CSP в vercel.json)
// и собственный CDN-домен media.<домен> (CLOUDFLARE_SETUP.md). Другой домен — добавить сюда одной строкой
export const AUDIO_HOSTS = [/(^|\.)r2\.dev$/i, /^media\.[a-z0-9-]+(\.[a-z0-9-]+)+$/i]

// Имена полей двух комплектов озвучки у реплики (нормализация, валидатор, воспроизведение)
export const AUDIO_SETS = {
  original: { url: 'audioUrl', timings: 'wordTimings', meta: 'audioMeta', text: 'text' },
  translation: { url: 'translationAudioUrl', timings: 'translationWordTimings', meta: 'translationAudioMeta', text: 'translation' },
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

// hash озвучки перевода — тот же приём, что audioHash, по тексту translation и голосу перевода
export function translationAudioHash(translation, spec) {
  return audioHash(translation, spec)
}

// Статус озвучки перевода: 'none' — файла нет; 'ready' — hash сошёлся с текущим переводом и
// голосом перевода (файл без meta — актуален); 'stale' — перевод/голос поменяли или перевод
// у реплики убрали (файл остался, озвучивать нечего — переозвучить или удалить)
export function translationAudioState(line, character, scene) {
  if (!line?.translationAudioUrl) return 'none'
  if (!str(line.translation)) return 'stale'
  const hash = line.translationAudioMeta?.hash
  if (!hash) return 'ready'
  return hash === translationAudioHash(line.translation, translationVoiceSpec(character, scene)) ? 'ready' : 'stale'
}

// Статистика по сцене: верхний уровень — оригинал (как раньше), translation — комплект перевода
// («оригинал X из N · перевод Y из N»); withText — у скольких реплик вообще есть translation
export function sceneVoiceStats(scene) {
  const tl = Array.isArray(scene?.timeline) ? scene.timeline : []
  const out = { total: tl.length, ready: 0, stale: 0, none: 0, translation: { total: tl.length, ready: 0, stale: 0, none: 0, withText: 0 } }
  for (const l of tl) {
    const ch = scene?.characters?.[l?.who]
    // Реплика-шаблон озвучивается по частям: «озвучена», когда озвучены все текстовые части; одни плейсхолдеры/знаки — не считаем
    const tpl = hasVarParts(l?.text)
    const st = tpl ? segmentsLineState(l, ch) : lineAudioState(l, ch)
    if (st) out[st] += 1
    else out.total -= 1
    // Перевод со словом ({food:ru}) не озвучивается (читает синтез устройства) — в счёт файлов перевода не идёт
    if (hasVarParts(l?.translation)) { out.translation.total -= 1; continue }
    out.translation[translationAudioState(l, ch, scene)] += 1
    if (str(l?.translation)) out.translation.withText += 1
  }
  return out
}

// Часть реплики как «реплика с одним комплектом озвучки» для audioLine.js (читает audioUrl,
// wordTimings, audioMeta, text): kind 'original' → сама реплика, 'translation' → поля перевода
export function audioPartOf(line, kind) {
  if (kind !== 'translation') return line
  const s = AUDIO_SETS.translation
  return { who: line?.who, text: line?.translation ?? '', audioUrl: line?.[s.url], wordTimings: line?.[s.timings], audioMeta: line?.[s.meta] }
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

// Поля озвучки, которые надо снять с реплики («Удалить озвучку») — оригинал и перевод отдельно
export const AUDIO_FIELDS = ['audioUrl', 'wordTimings', 'audioMeta']
export const TRANSLATION_AUDIO_FIELDS = ['translationAudioUrl', 'translationWordTimings', 'translationAudioMeta']
