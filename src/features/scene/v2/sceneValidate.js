import { LOCATIONS } from './sprites/backgrounds.js'
import { getSlot, slotsFor } from './sprites/slots.js'
import { getSprite } from './sprites/spriteRegistry.js'
import {
  SCENE_VERSION_V2, CHARACTER_KEYS, GENDERS, EMOTIONS, POSES, LIMITS, isObj,
} from './sceneConstants.js'
import { validateTask, minLinesFor } from './sceneTask.js'
import { validateLineAudio } from './sceneValidateAudio.js'
import { VOICE_RANGE } from './sceneVoice.js'
import { validateSceneOptions } from './sceneOptions.js'

// Валидация сцены v2: список ошибок по-русски с путями (characters.a.name,
// timeline[3].text…). Пустой список — сцена годная. Проверяет форму и
// пределы; смысловые предупреждения (пустые слоты, подряд один говорящий,
// бюджет узлов) — в sceneLint.js.

const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i

function validateCharacter(c, key, errors) {
  const p = `characters.${key}`
  if (!isObj(c)) { errors.push(`${p} — объект персонажа`); return }
  if (c.kind !== undefined && c.kind !== 'cat') errors.push(`${p}.kind — пока только 'cat'`)
  if (!GENDERS.includes(c.gender)) errors.push(`${p}.gender — ${GENDERS.join(' | ')}`)
  if (typeof c.name !== 'string' || !c.name.trim()) errors.push(`${p}.name — непустая строка`)
  else if (c.name.length > LIMITS.maxNameLen) errors.push(`${p}.name — не длиннее ${LIMITS.maxNameLen} символов`)
  if (c.palette !== undefined) {
    if (!isObj(c.palette)) errors.push(`${p}.palette — объект цветов { fur, accent, … }`)
    else {
      for (const [k, v] of Object.entries(c.palette)) {
        if (!['fur', 'accent', 'belly', 'eye', 'stripe'].includes(k)) errors.push(`${p}.palette.${k} — неизвестный цвет (fur, accent, belly, eye, stripe)`)
        else if (typeof v !== 'string' || !HEX.test(v)) errors.push(`${p}.palette.${k} — цвет вида #rrggbb`)
      }
    }
  }
  if (c.stripes !== undefined && typeof c.stripes !== 'boolean') errors.push(`${p}.stripes — true/false`)
  if (c.voice !== undefined) {
    if (!isObj(c.voice)) errors.push(`${p}.voice — объект { pitch, rate, voiceId?, stability?, similarity?, speed?, translationVoiceId? }`)
    else {
      const { pitch, rate, voiceId, translationVoiceId } = c.voice
      if (pitch !== undefined && !(typeof pitch === 'number' && pitch >= 0 && pitch <= 2)) errors.push(`${p}.voice.pitch — число 0…2`)
      if (rate !== undefined && !(typeof rate === 'number' && rate >= 0.1 && rate <= 10)) errors.push(`${p}.voice.rate — число 0.1…10`)
      if (voiceId !== undefined && typeof voiceId !== 'string') errors.push(`${p}.voice.voiceId — строка`)
      if (translationVoiceId !== undefined && typeof translationVoiceId !== 'string') errors.push(`${p}.voice.translationVoiceId — строка`)
      // Настройки ElevenLabs (sceneVoice.js): в hash озвучки и в запрос TTS
      for (const [k, [lo, hi]] of Object.entries(VOICE_RANGE)) {
        const v = c.voice[k]
        if (v !== undefined && !(typeof v === 'number' && v >= lo && v <= hi)) errors.push(`${p}.voice.${k} — число ${lo}…${hi}`)
      }
    }
  }
}

function validateSlots(slots, location, errors) {
  if (slots === undefined) return
  if (!isObj(slots)) { errors.push('slots — объект { слот: id спрайта | null }'); return }
  const known = slotsFor(location)
  if (!known.length) return
  for (const [slotId, spriteId] of Object.entries(slots)) {
    const slot = getSlot(location, slotId)
    if (!slot) { errors.push(`slots.${slotId} — нет такого слота в локации '${location}' (${known.map(s => s.id).join(', ')})`); continue }
    if (spriteId === null) continue
    if (typeof spriteId !== 'string') { errors.push(`slots.${slotId} — id спрайта или null`); continue }
    const sprite = getSprite(spriteId)
    if (!sprite || sprite.kind !== 'prop') errors.push(`slots.${slotId} — неизвестный предмет '${spriteId}'`)
    else if (!slot.accepts.includes(spriteId)) errors.push(`slots.${slotId} — предмет '${spriteId}' сюда не ставится (можно: ${slot.accepts.join(', ')})`)
  }
}

function validateLine(l, i, errors) {
  const p = `timeline[${i}]`
  if (!isObj(l)) { errors.push(`${p} — объект реплики`); return }
  if (!CHARACTER_KEYS.includes(l.who)) errors.push(`${p}.who — 'a' или 'b'`)
  if (typeof l.text !== 'string' || !l.text.trim()) errors.push(`${p}.text — непустая строка`)
  else if (l.text.trim().length > LIMITS.maxTextLen) errors.push(`${p}.text — не длиннее ${LIMITS.maxTextLen} символов (сейчас ${l.text.trim().length})`)
  if (l.emotion !== undefined && !EMOTIONS.includes(l.emotion)) errors.push(`${p}.emotion — ${EMOTIONS.join(' | ')}`)
  if (l.pose !== undefined && !POSES.includes(l.pose)) errors.push(`${p}.pose — ${POSES.join(' | ')}`)
  if (l.translation !== undefined && typeof l.translation !== 'string') errors.push(`${p}.translation — строка`)
  // Перевод ограничен как и текст: два комплекта таймингов на реплику должны уложить сцену в 64 КБ
  else if (typeof l.translation === 'string' && l.translation.trim().length > LIMITS.maxTextLen) errors.push(`${p}.translation — не длиннее ${LIMITS.maxTextLen} символов (сейчас ${l.translation.trim().length})`)
  validateLineAudio(l, p, errors) // audioUrl/wordTimings/audioMeta и translation*-тройка — sceneValidateAudio.js
}

export function validateSceneV2(scene) {
  const errors = []
  if (!isObj(scene)) return ['Сцена должна быть объектом']
  if (scene.version !== SCENE_VERSION_V2) errors.push(`version — должно быть ${SCENE_VERSION_V2}`)
  if (scene.id !== undefined && (typeof scene.id !== 'string' || !/^[a-z0-9][a-z0-9-_]*$/i.test(scene.id))) errors.push('id — латиница/цифры/дефис')
  if (scene.title !== undefined && typeof scene.title !== 'string') errors.push('title — строка')
  else if (typeof scene.title === 'string' && scene.title.length > LIMITS.maxTitleLen) errors.push(`title — не длиннее ${LIMITS.maxTitleLen} символов`)
  if (!LOCATIONS.includes(scene.location)) errors.push(`location — ${LOCATIONS.join(' | ')}`)

  if (!isObj(scene.characters)) errors.push('characters — объект { a, b }')
  else {
    for (const k of CHARACTER_KEYS) validateCharacter(scene.characters[k], k, errors)
    for (const k of Object.keys(scene.characters)) if (!CHARACTER_KEYS.includes(k)) errors.push(`characters.${k} — лишний персонаж, допустимы только a и b`)
  }

  validateSlots(scene.slots, scene.location, errors)

  if (!Array.isArray(scene.timeline)) errors.push('timeline — массив реплик')
  else {
    const minLines = minLinesFor(scene)
    if (scene.timeline.length < minLines) {
      errors.push(`timeline — минимум ${minLines} ${minLines === 1 ? 'реплика' : 'реплики'}${minLines > 1 ? ' (для задания «Повтори»/«Ответь коту» достаточно одной)' : ''}`)
    }
    if (scene.timeline.length > LIMITS.maxLines) errors.push(`timeline — максимум ${LIMITS.maxLines} реплик (сейчас ${scene.timeline.length})`)
    scene.timeline.forEach((l, i) => validateLine(l, i, errors))
  }

  validateSceneOptions(scene.options, errors) // bubbles/autoplay/loop, display, voice, translationVoiceId — sceneOptions.js
  // Задание после сцены (sceneTask.js) — необязательное; смысловые проверки (есть ли перевод) — в sceneLint
  validateTask(scene.task, Array.isArray(scene.timeline) ? scene.timeline.length : undefined, errors)
  return errors
}
