import { DEFAULT_VOICE_ID, VOICE_RANGE, VOICE_DEFAULTS } from '../../../scene/v2/sceneVoice.js'

// Голоса ElevenLabs для котов. Списка голосов аккаунта у проекта нет (edge function
// elevenlabs-voices не заводили — отдельный вызов API и ещё одна функция на деплой),
// поэтому — стандартные premade-голоса ElevenLabs с устойчивыми id (модель
// eleven_multilingual_v2 читает ими по-русски) плюс «голос проекта» (серверный секрет
// ELEVENLABS_VOICE_ID, тот же, что у голосовых в уроках) и поле для своего id.
// Коты должны различаться: по умолчанию коту — мужской голос, кошке — женский.

export const VOICE_PRESETS = [
  { id: DEFAULT_VOICE_ID, name: 'Голос проекта', gender: null, note: 'секрет ELEVENLABS_VOICE_ID — как у голосовых уроков' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male', note: 'низкий, спокойный' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'male', note: 'мягкий, дружелюбный' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'male', note: 'молодой, энергичный' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'male', note: 'хрипловатый, уверенный' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', gender: 'male', note: 'ровный, рассказчик' },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female', note: 'спокойный, тёплый' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', gender: 'female', note: 'мягкий, юный' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'female', note: 'бодрый, звонкий' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', gender: 'female', note: 'лёгкий, эмоциональный' },
]

export const CUSTOM_VOICE = 'custom'

// Подсказка по умолчанию: первый пресет своего пола (кот — Adam, кошка — Rachel)
export function defaultVoiceFor(gender) {
  return VOICE_PRESETS.find(v => v.gender === (gender === 'female' ? 'female' : 'male'))?.id ?? DEFAULT_VOICE_ID
}

export function presetOf(voiceId) {
  const id = typeof voiceId === 'string' && voiceId.trim() ? voiceId.trim() : DEFAULT_VOICE_ID
  return VOICE_PRESETS.find(v => v.id === id) ?? null
}

// Подпись голоса для статуса/диалога: «Adam» / «Голос проекта» / «свой: abc…»
export function voiceName(voiceId) {
  const p = presetOf(voiceId)
  if (p) return p.name
  const id = String(voiceId ?? '')
  return `свой: ${id.length > 10 ? `${id.slice(0, 8)}…` : id}`
}

// Значение <select>: id пресета либо CUSTOM_VOICE (id не из списка)
export function selectValue(voiceId) {
  return presetOf(voiceId) ? presetOf(voiceId).id : CUSTOM_VOICE
}

// Ползунки настроек: ключ голоса, подпись, диапазон, шаг
export const VOICE_SLIDERS = [
  { key: 'stability', label: 'стабильность', range: VOICE_RANGE.stability, step: 0.05, hint: 'ниже — живее и разнообразнее, выше — ровнее' },
  { key: 'similarity', label: 'похожесть', range: VOICE_RANGE.similarity, step: 0.05, hint: 'насколько точно держаться исходного голоса' },
  { key: 'speed', label: 'скорость', range: VOICE_RANGE.speed, step: 0.05, hint: '1 — обычная' },
]

export const sliderValue = (voice, key) => (typeof voice?.[key] === 'number' ? voice[key] : VOICE_DEFAULTS[key])

// Тестовая фраза «Прослушать голос» — короткая, чтобы не тратить квоту
export const PREVIEW_PHRASE = 'Привет! Я кот, и я говорю по-русски.'
// «Прослушать голос перевода» — так звучит диктор между репликами
export const TRANSLATION_PREVIEW_PHRASE = 'Это перевод реплики. Его читает диктор.'

// Голос перевода: отдельного русскоязычного пресета у ElevenLabs нет — модель
// eleven_multilingual_v2 читает русский любым голосом списка. Для диктора подсказываем ровный
// рассказчик (Sam) — чтобы отличался от голосов котов
export const TRANSLATION_VOICE_HINT = 'Русскоязычного пресета у ElevenLabs нет: модель eleven_multilingual_v2 читает русский любым голосом из списка. Для диктора подходит ровный «Sam» или спокойная «Rachel» — лишь бы отличался от голосов котов.'
export const SUGGESTED_TRANSLATION_VOICE = 'yoZ06aMxZJJ28mfd3POQ' // Sam

// ElevenLabs списывает квоту по символам текста (пробелы и знаки тоже)
export function charCost(text) {
  return String(text ?? '').trim().length
}

export function sumChars(texts) {
  return texts.reduce((n, t) => n + charCost(t), 0)
}
