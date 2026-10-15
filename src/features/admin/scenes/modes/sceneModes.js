import { DISPLAY_MODES } from '../../../scene/v2/sceneConstants.js'
import { displayOfOptions, normalizeVoiceFlags, isDisplayMode } from '../../../scene/v2/sceneOptions.js'

// Режимы показа текста и озвучки в сборщике — чистая логика без React (тест sceneModes.test.js).
// Две сущности, которые важно не путать:
//   · записано в сцене — scene.options.display / options.voice (контракт ядра, sceneOptions.js);
//   · предпросмотровое переопределение — { display: null | режим, voice: { original?, translation? } },
//     живёт только в окне сборщика, уходит пропами display/voice в SceneRenderer и сцену НЕ меняет.
// «Сделать по умолчанию для сцены» переносит переопределение в options (applyOverrideToScene) и
// очищает его. Старые сцены (без display/voice в options) не меняются, пока админ не тронул контрол:
// setDisplay/setVoiceFlag пишут поля только при вызове.

export const DISPLAY_LABEL = { none: 'Без текста', text: 'С текстом', both: 'Текст + перевод' }
export const DISPLAY_SHORT = { none: 'Без текста', text: 'Текст', both: 'Текст + перевод' }
export const DISPLAY_OPTIONS = DISPLAY_MODES.map(id => ({ id, label: DISPLAY_LABEL[id], short: DISPLAY_SHORT[id] }))
export const VOICE_KEYS = ['original', 'translation']
export const VOICE_LABEL = { original: 'Озвучка оригинала', translation: 'Озвучка перевода' }

export const EMPTY_OVERRIDE = { display: null, voice: {} }

// Что записано в сцене (эффективно, с учётом старого bubbles)
export function sceneModes(scene) {
  return { display: displayOfOptions(scene?.options), voice: normalizeVoiceFlags(scene?.options?.voice) }
}

// Что видно в предпросмотре: переопределение поверх сцены
export function effectiveModes(scene, override = EMPTY_OVERRIDE) {
  const base = sceneModes(scene)
  const o = override ?? EMPTY_OVERRIDE
  return {
    display: isDisplayMode(o.display) ? o.display : base.display,
    voice: normalizeVoiceFlags(o.voice, base.voice),
  }
}

// Какие поля предпросмотра отличаются от записанного в сцене
export function overriddenFlags(scene, override = EMPTY_OVERRIDE) {
  const base = sceneModes(scene)
  const eff = effectiveModes(scene, override)
  const display = eff.display !== base.display
  const original = eff.voice.original !== base.voice.original
  const translation = eff.voice.translation !== base.voice.translation
  return { display, original, translation, any: display || original || translation }
}

// Поставить значение в предпросмотре: совпало с записанным в сцене → переопределение снимается
// (чтобы «как в сцене» не висело лишним флагом)
export function setOverride(override, scene, key, value) {
  const o = override ?? EMPTY_OVERRIDE
  const base = sceneModes(scene)
  if (key === 'display') return { ...o, display: value === base.display ? null : value }
  if (!VOICE_KEYS.includes(key)) return o
  const voice = { ...o.voice }
  if (!!value === base.voice[key]) delete voice[key]; else voice[key] = !!value
  return { ...o, voice }
}

export const hasOverride = override => !!override && (isDisplayMode(override.display) || Object.keys(override.voice ?? {}).length > 0)

// Переопределение → пропы SceneRenderer (display: строка или undefined; voice: объект или null)
export function overrideProps(override) {
  const o = override ?? EMPTY_OVERRIDE
  return { display: isDisplayMode(o.display) ? o.display : undefined, voice: Object.keys(o.voice ?? {}).length ? o.voice : null }
}

// ── Запись в сцену (options) ───────────────────────────────────────────────────────────────────
// display пишется вместе с bubbles (display !== 'none'), чтобы старый код, читающий bubbles, видел то же
export function setDisplay(scene, mode) {
  if (!isDisplayMode(mode)) return scene
  return { ...scene, options: { ...scene.options, display: mode, bubbles: mode !== 'none' } }
}

// voice пишется целиком { original, translation } — неполный объект ядро дополняет, но явно понятнее
export function setVoiceFlag(scene, key, value) {
  if (!VOICE_KEYS.includes(key)) return scene
  const voice = normalizeVoiceFlags({ ...(scene.options?.voice ?? {}), [key]: !!value }, normalizeVoiceFlags(scene.options?.voice))
  return { ...scene, options: { ...scene.options, voice } }
}

// Общий голос перевода сцены (пусто — удалить поле: тогда «голос проекта»)
export function setTranslationVoiceId(scene, id) {
  const options = { ...scene.options }
  const clean = String(id ?? '').trim()
  if (clean) options.translationVoiceId = clean; else delete options.translationVoiceId
  return { ...scene, options }
}

// «Сделать по умолчанию для сцены»: переопределение → options; пишутся только отличающиеся поля
export function applyOverrideToScene(scene, override) {
  const f = overriddenFlags(scene, override)
  const eff = effectiveModes(scene, override)
  let s = scene
  if (f.display) s = setDisplay(s, eff.display)
  if (f.original) s = setVoiceFlag(s, 'original', eff.voice.original)
  if (f.translation) s = setVoiceFlag(s, 'translation', eff.voice.translation)
  return s
}

// Сводка режимов сцены словами: «показ: текст · озвучка: оригинал + перевод» (пикер ноды, модуль ленты)
export function modesSummary(scene, override = EMPTY_OVERRIDE) {
  const m = effectiveModes(scene, override)
  const v = [m.voice.original ? 'оригинал' : null, m.voice.translation ? 'перевод' : null].filter(Boolean)
  return `показ: ${DISPLAY_SHORT[m.display].toLowerCase()} · озвучка: ${v.length ? v.join(' + ') : 'выключена'}`
}
