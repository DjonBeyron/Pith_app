import { isObj } from './sceneConstants.js'
import { isSceneAudioUrl, MAX_WORD_TIMINGS, HASH_RE, AUDIO_SETS } from './sceneVoice.js'

// Проверка полей озвучки реплики — вынесена из sceneValidate.js, чтобы правила ElevenLabs жили
// рядом с sceneVoice.js. Два комплекта одной формы (AUDIO_SETS): оригинал (audioUrl, wordTimings,
// audioMeta) и перевод (translationAudioUrl, translationWordTimings, translationAudioMeta) —
// одинаковые домены, лимиты и ошибки с путём timeline[i].… по-русски.

function validateTimings(t, p, errors) {
  if (!Array.isArray(t)) { errors.push(`${p} — массив [{ word, start, end }]`); return }
  if (t.length > MAX_WORD_TIMINGS) errors.push(`${p} — не больше ${MAX_WORD_TIMINGS} слов (сейчас ${t.length})`)
  let prev = -1
  t.forEach((w, i) => {
    const ok = isObj(w) && typeof w.start === 'number' && typeof w.end === 'number' && w.end >= w.start && w.start >= prev
    if (!ok) errors.push(`${p}[${i}] — { start, end } в секундах, по возрастанию`)
    else if (w.word !== undefined && typeof w.word !== 'string') errors.push(`${p}[${i}].word — строка`)
    if (isObj(w) && typeof w.start === 'number') prev = w.start
  })
}

function validateMeta(m, p, errors) {
  if (!isObj(m)) { errors.push(`${p} — объект { hash, voiceId, durationMs? }`); return }
  if (typeof m.hash !== 'string' || !HASH_RE.test(m.hash)) errors.push(`${p}.hash — sha-256 в hex (64 символа)`)
  if (m.voiceId !== undefined && (typeof m.voiceId !== 'string' || !m.voiceId)) errors.push(`${p}.voiceId — непустая строка`)
  if (m.durationMs !== undefined && !(Number.isInteger(m.durationMs) && m.durationMs >= 0)) errors.push(`${p}.durationMs — целое число миллисекунд ≥ 0`)
  for (const k of Object.keys(m)) if (!['hash', 'voiceId', 'durationMs'].includes(k)) errors.push(`${p}.${k} — лишнее поле`)
}

// Один комплект { url, timings, meta } (имена полей из AUDIO_SETS)
function validateAudioSet(l, p, set, errors) {
  if (l[set.url] !== undefined && !isSceneAudioUrl(l[set.url])) {
    errors.push(`${p}.${set.url} — https-адрес файла на домене R2 проекта (…r2.dev)`)
  }
  if (l[set.timings] !== undefined) validateTimings(l[set.timings], `${p}.${set.timings}`, errors)
  if (l[set.meta] !== undefined) validateMeta(l[set.meta], `${p}.${set.meta}`, errors)
  if (l[set.url] === undefined && (l[set.timings] !== undefined || l[set.meta] !== undefined)) {
    errors.push(`${p} — ${set.timings}/${set.meta} без ${set.url}: уберите их или добавьте файл`)
  }
}

export function validateLineAudio(l, p, errors) {
  for (const set of Object.values(AUDIO_SETS)) validateAudioSet(l, p, set, errors)
}
