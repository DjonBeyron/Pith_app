// Формат сцены v2 — JSON, который одинаково собирает человек в админке и
// нейросеть по легенде (sceneLegend.js). Это ядро конструктора «два кота
// говорят» для ленты, уроков (нода «сцена» — позже), карточек повтора.
//
// {
//   version: 2, id, title, location: 'office' | 'cafe',
//   characters: { a: Character, b: Character },     // два: a слева, b справа — или { a } без b: один кот
//                                                    // («Пит», по центру; scenePit.js — реплики только who 'a')
//   slots: { [slotId]: spriteId | null },             // ячейки предметов локации (sprites/slots.js)
//   timeline: [Line, ...],                            // 2…12 реплик
//   options: { bubbles: true, autoplay: false, loop: false,
//              display?: 'none' | 'text' | 'both', voice?: { original: true, translation: false },
//              translationVoiceId? }                       // режимы показа/озвучки — sceneOptions.js
//   vars?: { [name]: { pick: 'weak'|'due'|'known', fallback: { text, translation? } } }   // шаблон под слова пользователя, ≤ 3 (sceneVars.js)
//   task?: { kind: 'translate'|'say'|'repeat', lineIndex, prompt?, accept[], hint?, answers[]?, keywords[]?, passRatio?, strict? }   // задание (sceneTask.js; голосовые say/repeat — sceneTaskVoice.js)
// }
// Character: { kind: 'cat', gender: 'male' | 'female', name, palette: { fur, accent, belly?, eye?, stripe? },
//              stripes: true, voice: { pitch 0…2, rate 0.1…10, voiceId?, stability?, similarity?, speed?,
//                                      translationVoiceId? } }
// Line: { who: 'a' | 'b', text (≤ 140; {name} — слово переменной), emotion, pose?, translation? ({name:ru} — перевод слова), segments?: [{ var } | { text?, audioUrl?, … }],
//         audioUrl?, wordTimings?: [{ word?, start, end }], audioMeta?: { hash, voiceId, durationMs? },
//         translationAudioUrl?, translationWordTimings?, translationAudioMeta? }   // то же для перевода
// audioUrl/wordTimings/audioMeta (и translation*-тройка для перевода) — заранее записанная
// озвучка ElevenLabs, ставит только сборщик (sceneVoice.js: hash → «устарело» и кэш);
// пусто — запасной вариант (speechSynthesis ru-RU или таймер).
//
// Этот файл — точка входа: нормализация здесь, остальное реэкспортом.

import { LOCATIONS } from './sprites/backgrounds.js'
import { emptySlots, slotsFor } from './sprites/slots.js'
import {
  SCENE_VERSION_V2, GENDERS, EMOTIONS, POSES, DEFAULT_VOICE, PALETTE_PRESETS, isObj,
} from './sceneConstants.js'
import { validateSceneV2 } from './sceneValidate.js'
import { normalizeTask } from './sceneTask.js'
import { normalizeSceneOptions } from './sceneOptions.js'
import { AUDIO_SETS } from './sceneVoice.js'
import { isSolo } from './scenePit.js'
import { normalizeVars, normalizeSegments } from './sceneVars.js'
import { cleanTitle } from './sceneNaming.js'

export * from './sceneConstants.js'
export { LOCATIONS }
export { validateSceneV2 }
export { migrateScene } from './sceneMigrate.js'
export { sceneNodeBudget, NODE_BUDGET } from './sceneBudget.js'
export { PIT, isSolo, speakersOf } from './scenePit.js'

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

function normalizeLine(l, solo) {
  const src = isObj(l) ? l : {}
  const out = {
    who: src.who === 'b' && !solo ? 'b' : 'a',
    text: typeof src.text === 'string' ? src.text.trim() : '',
    emotion: EMOTIONS.includes(src.emotion) ? src.emotion : 'neutral',
    pose: POSES.includes(src.pose) ? src.pose : 'talk',
  }
  if (typeof src.translation === 'string' && src.translation.trim()) out.translation = src.translation.trim()
  // Два комплекта озвучки — оригинал (audioUrl…) и перевод (translationAudioUrl…), поля одинаковой формы
  for (const set of Object.values(AUDIO_SETS)) {
    if (typeof src[set.url] === 'string' && src[set.url]) out[set.url] = src[set.url]
    if (Array.isArray(src[set.timings]) && src[set.timings].length) out[set.timings] = src[set.timings]
    if (isObj(src[set.meta]) && typeof src[set.meta].hash === 'string') out[set.meta] = src[set.meta]
  }
  const segments = normalizeSegments(src.segments)
  if (segments) out.segments = segments // задел под озвучку по сегментам (sceneVars.js)
  return out
}

// Дополняет сцену значениями по умолчанию: палитры, голос, пустые слоты
// локации (неизвестные слоты отбрасываются), эмоция/поза реплик, options
// (sceneOptions.js: display дописывается только если был задан — старые сцены не меняются).
// Одиночная сцена (characters без b) остаётся одиночной: b НЕ достраивается, who реплик → 'a'.
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
  const solo = isSolo(s)
  const out = {
    version: SCENE_VERSION_V2,
    id: typeof s.id === 'string' && s.id ? s.id : 'scene',
    title: typeof s.title === 'string' ? cleanTitle(s.title) : '',
    location,
    characters: solo
      ? { a: normalizeCharacter(chars.a, 'a') }
      : { a: normalizeCharacter(chars.a, 'a'), b: normalizeCharacter(chars.b, 'b') },
    slots,
    timeline: Array.isArray(s.timeline) ? s.timeline.map(l => normalizeLine(l, solo)) : [],
    options: normalizeSceneOptions(s.options),
  }
  const task = normalizeTask(s.task)
  if (task) out.task = task // без задания поля нет вовсе — старые сцены не меняются
  const vars = normalizeVars(s.vars)
  if (vars) out.vars = vars // слова-переменные шаблона (sceneVars.js); без них поля нет
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
