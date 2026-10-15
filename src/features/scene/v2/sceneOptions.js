import { DISPLAY_MODES, DEFAULT_VOICE_FLAGS, isObj } from './sceneConstants.js'
import { normalizeFeedFrame, validateFeedFrame } from './sceneFeedFrame.js'

// Режим показа текста и флаги озвучки сцены v2 (options), версия формата остаётся 2:
//   options.display: 'none' | 'text' | 'both'   — облачка скрыты / оригинал / оригинал + перевод
//   options.voice:   { original: true, translation: false } — озвучивать оригинал / перевод
//   options.translationVoiceId?: голос ElevenLabs для перевода на всю сцену (sceneVoice.js)
//   options.feedFrame?: { scale, x, y, anchor? } — кадрирование ТОЛЬКО в ленте (sceneFeedFrame.js)
// Совместимость со старым options.bubbles (true ↔ 'text', false ↔ 'none') — в одну сторону:
//   · в сцене есть валидный display → он главный, bubbles = display !== 'none' (чтобы старый код,
//     читающий bubbles, видел согласованное значение);
//   · display нет → режим берётся из bubbles, а поле display в сцену НЕ дописывается — старые
//     сцены в библиотеке после нормализации остаются прежними, и чекбокс «облачки» сборщика
//     продолжает работать, пока UI не научится писать display.
// Поверх options рендерер/режиссёр принимают переопределения (пропы display/voice, поле ноды
// урока): resolveDisplay / resolveVoiceFlags. Задание «О чём диалог» (scene.task) скрывает
// переводы в облачках и перекрывает 'both' — bubbleDisplay.

export const DEFAULT_DISPLAY = 'text'

export const isDisplayMode = v => DISPLAY_MODES.includes(v)

export function displayFromBubbles(bubbles) {
  return bubbles === false ? 'none' : DEFAULT_DISPLAY
}

// Эффективный режим показа из options сцены (с учётом старого bubbles)
export function displayOfOptions(options) {
  const o = isObj(options) ? options : {}
  return isDisplayMode(o.display) ? o.display : displayFromBubbles(o.bubbles)
}

// Флаги озвучки: неполный объект дополняется базой (по умолчанию DEFAULT_VOICE_FLAGS)
export function normalizeVoiceFlags(raw, base = DEFAULT_VOICE_FLAGS) {
  const v = isObj(raw) ? raw : {}
  return {
    original: typeof v.original === 'boolean' ? v.original : base.original,
    translation: typeof v.translation === 'boolean' ? v.translation : base.translation,
  }
}

// options сцены после нормализации: bubbles/autoplay/loop как раньше; display, voice (дополненный
// до { original, translation }) и translationVoiceId — только если были заданы: старые сцены после
// нормализации не меняются ни на байт. Эффективные значения — displayOfOptions / resolveVoiceFlags
export function normalizeSceneOptions(raw) {
  const o = isObj(raw) ? raw : {}
  const hasDisplay = isDisplayMode(o.display)
  const display = hasDisplay ? o.display : displayFromBubbles(o.bubbles)
  const out = { bubbles: display !== 'none', autoplay: o.autoplay === true, loop: o.loop === true }
  if (hasDisplay) out.display = display
  if (isObj(o.voice)) out.voice = normalizeVoiceFlags(o.voice)
  if (typeof o.translationVoiceId === 'string' && o.translationVoiceId.trim()) out.translationVoiceId = o.translationVoiceId.trim()
  const ff = normalizeFeedFrame(o.feedFrame)
  if (ff) out.feedFrame = ff
  return out
}

// Ошибки формата options (зовёт validateSceneV2). Неизвестные ключи, как и раньше, — только true/false
export function validateSceneOptions(options, errors) {
  if (options === undefined) return
  if (!isObj(options)) { errors.push('options — объект { bubbles, autoplay, loop, display?, voice?, translationVoiceId?, feedFrame? }'); return }
  for (const [k, v] of Object.entries(options)) {
    if (k === 'display') { if (!isDisplayMode(v)) errors.push(`options.display — ${DISPLAY_MODES.join(' | ')}`) }
    else if (k === 'feedFrame') validateFeedFrame(v, errors)
    else if (k === 'translationVoiceId') { if (typeof v !== 'string' || !v.trim()) errors.push('options.translationVoiceId — непустая строка') }
    else if (k === 'voice') {
      if (!isObj(v)) { errors.push('options.voice — объект { original, translation } из true/false'); continue }
      for (const [vk, vv] of Object.entries(v)) {
        if (!['original', 'translation'].includes(vk)) errors.push(`options.voice.${vk} — лишнее поле (original, translation)`)
        else if (typeof vv !== 'boolean') errors.push(`options.voice.${vk} — true/false`)
      }
    } else if (typeof v !== 'boolean') errors.push(`options.${k} — true/false`)
  }
}

// Режим показа с учётом переопределений: display (строка) главнее showBubbles (старый проп:
// false → 'none', true → режим сцены, но не 'none'), оба пустые → режим сцены
export function resolveDisplay(scene, { display, showBubbles } = {}) {
  if (isDisplayMode(display)) return display
  const own = displayOfOptions(scene?.options)
  if (showBubbles === false) return 'none'
  if (showBubbles === true) return own === 'none' ? DEFAULT_DISPLAY : own
  return own
}

// Что реально показывать в облачке: задание «О чём диалог» скрывает переводы (ответ не должен
// быть перед глазами), поэтому 'both' при scene.task → 'text'
export function bubbleDisplay(scene, overrides) {
  const d = resolveDisplay(scene, overrides)
  return d === 'both' && scene?.task ? 'text' : d
}

// Флаги озвучки с учётом переопределения (неполный объект поверх options сцены)
export function resolveVoiceFlags(scene, override) {
  const base = normalizeVoiceFlags(scene?.options?.voice)
  return override ? normalizeVoiceFlags(override, base) : base
}
