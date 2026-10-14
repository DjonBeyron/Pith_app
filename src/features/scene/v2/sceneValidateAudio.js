import { isObj } from './sceneConstants.js'
import { isSceneAudioUrl, MAX_WORD_TIMINGS, HASH_RE } from './sceneVoice.js'

// Проверка полей озвучки реплики (audioUrl, wordTimings, audioMeta) — вынесена из
// sceneValidate.js, чтобы правила ElevenLabs жили рядом с sceneVoice.js. Ошибки с путём
// timeline[i].… по-русски, как у остальных полей.

function validateTimings(t, p, errors) {
  if (!Array.isArray(t)) { errors.push(`${p}.wordTimings — массив [{ word, start, end }]`); return }
  if (t.length > MAX_WORD_TIMINGS) errors.push(`${p}.wordTimings — не больше ${MAX_WORD_TIMINGS} слов (сейчас ${t.length})`)
  let prev = -1
  t.forEach((w, i) => {
    const ok = isObj(w) && typeof w.start === 'number' && typeof w.end === 'number' && w.end >= w.start && w.start >= prev
    if (!ok) errors.push(`${p}.wordTimings[${i}] — { start, end } в секундах, по возрастанию`)
    else if (w.word !== undefined && typeof w.word !== 'string') errors.push(`${p}.wordTimings[${i}].word — строка`)
    if (isObj(w) && typeof w.start === 'number') prev = w.start
  })
}

function validateMeta(m, p, errors) {
  if (!isObj(m)) { errors.push(`${p}.audioMeta — объект { hash, voiceId, durationMs? }`); return }
  if (typeof m.hash !== 'string' || !HASH_RE.test(m.hash)) errors.push(`${p}.audioMeta.hash — sha-256 в hex (64 символа)`)
  if (m.voiceId !== undefined && (typeof m.voiceId !== 'string' || !m.voiceId)) errors.push(`${p}.audioMeta.voiceId — непустая строка`)
  if (m.durationMs !== undefined && !(Number.isInteger(m.durationMs) && m.durationMs >= 0)) errors.push(`${p}.audioMeta.durationMs — целое число миллисекунд ≥ 0`)
  for (const k of Object.keys(m)) if (!['hash', 'voiceId', 'durationMs'].includes(k)) errors.push(`${p}.audioMeta.${k} — лишнее поле`)
}

export function validateLineAudio(l, p, errors) {
  if (l.audioUrl !== undefined && !isSceneAudioUrl(l.audioUrl)) {
    errors.push(`${p}.audioUrl — https-адрес файла на домене R2 проекта (…r2.dev)`)
  }
  if (l.wordTimings !== undefined) validateTimings(l.wordTimings, p, errors)
  if (l.audioMeta !== undefined) validateMeta(l.audioMeta, p, errors)
  if (l.audioUrl === undefined && (l.wordTimings !== undefined || l.audioMeta !== undefined)) {
    errors.push(`${p} — wordTimings/audioMeta без audioUrl: уберите их или добавьте файл`)
  }
}
