import { emptySlots } from './sprites/slots.js'
import { PALETTE_PRESETS, isObj } from './sceneConstants.js'

// Миграция сценария стенда (version 1: characters[] с colors{body,belly,ear,
// eye,nose,stripe}, background 'office'|'kitchen', timeline[{who: id}]) в
// формат v2. Стенд остаётся жить своим форматом; это мост для переноса его
// демо-сценариев и для «вставил старый JSON — получил новый».

// Набор предметов, повторяющий фон стенда (окно, часы, картина, стол с
// ноутбуком и кружкой, растение) — им заполняются слоты мигрированной сцены
export const DEFAULT_SLOTS = {
  office: {
    window: 'window', 'wall-art': 'picture', 'floor-right': 'plant', table: 'table',
    'desk-left': 'laptop', 'desk-right': 'mug', 'wall-clock': 'wall-clock',
  },
  cafe: {
    window: 'window', 'wall-art': 'picture', 'floor-right': 'plant', table: 'table',
    'table-left': 'coffee-cup', 'table-right': 'pastry-plate', 'wall-menu': 'menu-board',
    ceiling: 'pendant-lamp', counter: 'coffee-machine',
  },
}

export function defaultSlots(location) {
  return { ...emptySlots(location), ...(DEFAULT_SLOTS[location] ?? {}) }
}

const LOCATION_FROM_V1 = { office: 'office', kitchen: 'cafe' }

// Пол в v1 не хранился — угадываем по голосу: высокий pitch → женский
function guessGender(c, index) {
  const pitch = c?.voice?.pitch
  if (typeof pitch === 'number') return pitch > 1.1 ? 'female' : 'male'
  return index === 0 ? 'male' : 'female'
}

function migrateCharacter(c, index) {
  const colors = isObj(c?.colors) ? c.colors : {}
  const base = index === 0 ? PALETTE_PRESETS.ginger : PALETTE_PRESETS.grey
  const palette = { ...base }
  if (colors.body) palette.fur = colors.body
  if (colors.belly) palette.belly = colors.belly
  if (colors.ear) palette.accent = colors.ear
  if (colors.eye) palette.eye = colors.eye
  if (colors.stripe) palette.stripe = colors.stripe
  return {
    kind: 'cat',
    gender: guessGender(c, index),
    name: typeof c?.name === 'string' && c.name ? c.name : (c?.id ?? (index === 0 ? 'Кот' : 'Кошка')),
    palette,
    stripes: true,
    voice: { pitch: c?.voice?.pitch ?? 1, rate: c?.voice?.rate ?? 1 },
  }
}

// v1 → v2. Уже v2 — возвращается как есть. Неизвестный формат — null.
export function migrateScene(scene, { id = 'migrated', title = '' } = {}) {
  if (!isObj(scene)) return null
  if (scene.version === 2) return scene
  if (scene.version !== 1 || !Array.isArray(scene.characters)) return null
  const location = LOCATION_FROM_V1[scene.background] ?? 'office'
  const [c0, c1] = scene.characters
  const keyOf = { [c0?.id]: 'a', [c1?.id]: 'b' }
  return {
    version: 2,
    id,
    title: title || (scene.title ?? ''),
    location,
    characters: { a: migrateCharacter(c0, 0), b: migrateCharacter(c1 ?? {}, 1) },
    slots: defaultSlots(location),
    timeline: (scene.timeline ?? []).map(l => ({
      who: keyOf[l?.who] ?? 'a',
      text: typeof l?.text === 'string' ? l.text.trim() : '',
      emotion: l?.emotion ?? 'neutral',
      pose: l?.pose ?? 'talk',
    })),
    options: { bubbles: true, autoplay: false, loop: false },
  }
}
