// Константы формата сцены v2 — отдельным файлом, чтобы схема, валидатор,
// миграция и легенда импортировали их без циклов.

export const SCENE_VERSION_V2 = 2
export const CHARACTER_KEYS = ['a', 'b']
export const GENDERS = ['male', 'female']
export const EMOTIONS = ['neutral', 'happy', 'tired', 'surprised']
export const POSES = ['idle', 'talk', 'lean']
// minLines — диалог (без задания или «О чём диалог»); minLinesVoice — задания «Повтори»/«Ответь коту»: хватает одной реплики
export const LIMITS = { minLines: 2, minLinesVoice: 1, maxLines: 12, maxTextLen: 140, maxNameLen: 24, maxTitleLen: 60 }

export const DEFAULT_VOICE = { pitch: 1, rate: 1 }
export const DEFAULT_OPTIONS = { bubbles: true, autoplay: false, loop: false }
// Режим показа текста в облачке (sceneOptions.js): без текста / оригинал / оригинал + перевод
export const DISPLAY_MODES = ['none', 'text', 'both']
// Что озвучивать у реплики (sceneOptions.js): оригинал (text) и/или перевод (translation)
export const DEFAULT_VOICE_FLAGS = { original: true, translation: false }

// Готовые палитры котов — чтобы два персонажа отличались даже без настройки
export const PALETTE_PRESETS = {
  ginger: { fur: '#f2a65a', belly: '#fde7c8', accent: '#f6a9a3', eye: '#5aa36b', stripe: '#d9843d' },
  grey: { fur: '#8e97a8', belly: '#e9ecf2', accent: '#f1b7c4', eye: '#e2b14c', stripe: '#6f7889' },
  cream: { fur: '#e9d3b3', belly: '#fbf3e6', accent: '#f1b7c4', eye: '#4f87c2', stripe: '#cdb08a' },
  black: { fur: '#3b3b45', belly: '#8f8f9c', accent: '#e59aa5', eye: '#e2b14c', stripe: '#2a2a32' },
}

export function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v) }
