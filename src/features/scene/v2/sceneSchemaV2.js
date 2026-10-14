// Формат сцены v2 — JSON, который одинаково собирает человек в админке и
// нейросеть по легенде (sceneLegend.js). Это ядро конструктора «два кота
// говорят» для ленты, уроков (нода «сцена» — позже), карточек повтора.
//
// {
//   version: 2, id, title, location: 'office' | 'cafe',
//   characters: { a: Character, b: Character },     // ровно два: a слева, b справа
//   slots: { [slotId]: spriteId | null },             // ячейки предметов локации (sprites/slots.js)
//   timeline: [Line, ...],                            // 2…12 реплик
//   options: { bubbles: true, autoplay: false, loop: false },
//   task?: { kind: 'translate', lineIndex, prompt?, accept[], hint? }   // задание «О чём диалог» (sceneTask.js)
// }
// Character: { kind: 'cat', gender: 'male' | 'female', name, palette: { fur, accent, belly?, eye?, stripe? },
//              stripes: true, voice: { pitch 0…2, rate 0.1…10, voiceId?, stability?, similarity?, speed? } }
// Line: { who: 'a' | 'b', text (≤ 140), emotion, pose?, translation?,
//         audioUrl?, wordTimings?: [{ word?, start, end }], audioMeta?: { hash, voiceId, durationMs? } }
// audioUrl/wordTimings/audioMeta — заранее записанная озвучка ElevenLabs, ставит
// только сборщик (sceneVoice.js: hash → «устарело» и кэш); пусто — запасной
// вариант (speechSynthesis ru-RU или таймер).
//
// Этот файл — точка входа: нормализация здесь, остальное реэкспортом.

import { LOCATIONS } from './sprites/backgrounds.js'
import { emptySlots, slotsFor } from './sprites/slots.js'
import {
  SCENE_VERSION_V2, GENDERS, EMOTIONS, POSES, DEFAULT_VOICE, DEFAULT_OPTIONS, PALETTE_PRESETS, isObj,
} from './sceneConstants.js'
import { validateSceneV2 } from './sceneValidate.js'
import { normalizeTask } from './sceneTask.js'

export * from './sceneConstants.js'
export { LOCATIONS }
export { validateSceneV2 }
export { migrateScene } from './sceneMigrate.js'
export { sceneNodeBudget, NODE_BUDGET } from './sceneBudget.js'

function normalizeCharacter(c, key) {
  const src = isObj(c) ? c : {}
  const palette = isObj(src.palette) ? src.palette : {}
  const basePal = key === 'b' ? PALETTE_PRESETS.grey : PALETTE_PRESETS.ginger
  return {
    kind: 'cat',
    gender: GENDERS.includes(src.gender) ? src.gender : (key === 'a' ? 'male' : 'female'),
    name: typeof src.name === 'string' && src.name.trim() ? src.name.trim() : (key === 'a' ? 'Кот' : 'Кошка'),
    palette: { ...basePal, ...Object.fromEntries(Object.entries(palette).filter(([, v]) => typeof v === 'string')) },
    stripes: src.stripes !== false,
    voice: { ...DEFAULT_VOICE, ...(isObj(src.voice) ? src.voice : {}) },
  }
}

function normalizeLine(l) {
  const src = isObj(l) ? l : {}
  const out = {
    who: src.who === 'b' ? 'b' : 'a',
    text: typeof src.text === 'string' ? src.text.trim() : '',
    emotion: EMOTIONS.includes(src.emotion) ? src.emotion : 'neutral',
    pose: POSES.includes(src.pose) ? src.pose : 'talk',
  }
  if (typeof src.translation === 'string' && src.translation.trim()) out.translation = src.translation.trim()
  if (typeof src.audioUrl === 'string' && src.audioUrl) out.audioUrl = src.audioUrl
  if (Array.isArray(src.wordTimings) && src.wordTimings.length) out.wordTimings = src.wordTimings
  if (isObj(src.audioMeta) && typeof src.audioMeta.hash === 'string') out.audioMeta = src.audioMeta
  return out
}

// Дополняет сцену значениями по умолчанию: палитры, голос, пустые слоты
// локации (неизвестные слоты отбрасываются), эмоция/поза реплик, options.
// Не проверяет — для этого validateSceneV2; нормализовать можно и невалидное.
export function normalizeSceneV2(scene) {
  const s = isObj(scene) ? scene : {}
  const location = LOCATIONS.includes(s.location) ? s.location : 'office'
  const slots = emptySlots(location)
  if (isObj(s.slots)) {
    for (const def of slotsFor(location)) {
      const v = s.slots[def.id]
      if (typeof v === 'string' && v) slots[def.id] = v
    }
  }
  const chars = isObj(s.characters) ? s.characters : {}
  const out = {
    version: SCENE_VERSION_V2,
    id: typeof s.id === 'string' && s.id ? s.id : 'scene',
    title: typeof s.title === 'string' ? s.title.trim() : '',
    location,
    characters: { a: normalizeCharacter(chars.a, 'a'), b: normalizeCharacter(chars.b, 'b') },
    slots,
    timeline: Array.isArray(s.timeline) ? s.timeline.map(normalizeLine) : [],
    options: { ...DEFAULT_OPTIONS, ...(isObj(s.options) ? s.options : {}) },
  }
  const task = normalizeTask(s.task)
  if (task) out.task = task // без задания поля нет вовсе — старые сцены не меняются
  return out
}

// Текст JSON → { scene, errors }: разбор, затем валидация, затем нормализация
export function parseSceneV2(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { scene: null, errors: [`JSON не разобран: ${e.message}`] }
  }
  const errors = validateSceneV2(raw)
  return { scene: errors.length ? null : normalizeSceneV2(raw), errors }
}
