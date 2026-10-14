import { slotsFor, COMMON_SLOT_IDS, getSlot } from '../../scene/v2/sprites/slots.js'
import { spritesForSlot, getSprite } from '../../scene/v2/sprites/spriteRegistry.js'

// Доступность ячеек-слотов для сборщика: какой слот можно заполнить сейчас, почему
// нельзя (нужна опора — стол), какие предметы в него встают. Чистые функции над сценой.

export const LAYER_LABEL = { wall: 'стена', floor: 'пол', table: 'стол', tabletop: 'на столе' }

// { slot, value, enabled, reason, options: [sprite], needsTitle }
export function slotState(scene, slot) {
  const value = scene.slots?.[slot.id] ?? null
  const needs = slot.needs ? getSlot(scene.location, slot.needs) : null
  const blocked = !!needs && !scene.slots?.[needs.id]
  return {
    slot,
    value,
    enabled: !blocked,
    reason: blocked ? `Сначала поставьте предмет в слот «${needs.title}» — иначе этот предмет повиснет в воздухе` : '',
    options: spritesForSlot(slot),
    sprite: value ? getSprite(value) : null,
  }
}

// Слоты локации по двум группам: общие (есть в любой локации) и свои
export function slotGroups(scene) {
  const all = slotsFor(scene.location).map(s => slotState(scene, s))
  return {
    common: all.filter(s => COMMON_SLOT_IDS.includes(s.slot.id)),
    local: all.filter(s => !COMMON_SLOT_IDS.includes(s.slot.id)),
  }
}

// Сколько слотов занято / всего
export function slotsFilled(scene) {
  const defs = slotsFor(scene.location)
  return { filled: defs.filter(d => scene.slots?.[d.id]).length, total: defs.length }
}

// Слоты, которые зависят от данного (для подсказки «убрать стол → очистятся …»)
export function dependents(scene, slotId) {
  return slotsFor(scene.location).filter(d => d.needs === slotId && scene.slots?.[d.id])
}
