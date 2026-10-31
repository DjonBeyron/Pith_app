import { normalizeSceneV2, PALETTE_PRESETS } from '../../scene/v2/sceneSchemaV2.js'
import { emptySlots, slotsFor, COMMON_SLOT_IDS } from '../../scene/v2/sprites/slots.js'
import { defaultSlots } from '../../scene/v2/sceneMigrate.js'
import { demoOfficeScene } from '../../scene/v2/demoScenes.js'
import { isSolo, pitCharacter } from '../../scene/v2/scenePit.js'
import { removeLine as removeLineOp } from './timelineOps.js'
import { retitle } from '../../scene/v2/sceneNaming.js'
import { isSkin, MASCOT_PACKS } from '../../scene/v2/sprites/mascot/mascots.js'

// Модель черновика сборщика сцен (этап 2). Черновик — это нормализованная сцена v2
// (sceneSchemaV2.js); все операции чистые: принимают сцену, возвращают новую, исходник
// не трогают. Реплики — timelineOps.js, доступность слотов — slotRules.js, резервная
// копия в localStorage — draftBackup.js. UI (BuilderWindow) только зовёт эти функции.

// Новая сцена: демо «Про работу» как стартовая точка — админ видит живую сцену сразу,
// а не пустой холст (пустая — через clearScene)
export function newDraft(location = 'office') {
  const base = normalizeSceneV2(demoOfficeScene)
  if (location === 'office') return { ...base, id: 'new-scene', title: 'Новая сцена' }
  return setLocation({ ...base, id: 'new-scene', title: 'Новая сцена' }, location, { fillDefaults: true })
}

// Пустая сцена той же локации: слоты пустые, две реплики-заготовки, персонажи как были
// (у одиночной сцены обе заготовки — от a)
export function clearScene(scene) {
  return normalizeSceneV2({
    ...scene,
    slots: emptySlots(scene.location),
    timeline: [
      { who: 'a', text: 'Привет!', emotion: 'happy' },
      { who: isSolo(scene) ? 'a' : 'b', text: 'Привет. Как дела?', emotion: 'neutral' },
    ],
  })
}

// Переключатель «Два кота / Один кот (Пит)» (scenePit.js). Один кот: персонаж a становится Питом
// (внешность и голос по умолчанию — дальше правятся в форме), b убирается, его реплики переходят к a
// (их озвучка станет «устаревшей» — голос другой, линтер подскажет переозвучить). Два кота: b по умолчанию.
export function setSolo(scene, solo) {
  if (!!solo === isSolo(scene)) return scene
  if (solo) {
    return normalizeSceneV2({
      ...scene,
      characters: { a: pitCharacter() },
      timeline: scene.timeline.map(l => (l.who === 'b' ? { ...l, who: 'a' } : l)),
    })
  }
  return normalizeSceneV2({ ...scene, characters: { a: scene.characters.a, b: {} } })
}

// Сколько реплик говорит b — чтобы предупредить перед переключением на одного кота
export const linesOfB = scene => (scene.timeline ?? []).filter(l => l.who === 'b').length

export function fromScene(scene) {
  return normalizeSceneV2(scene)
}

// Название сцены (1–80, пробелы чистятся); служебный id следует за ним, пока он автоматический (sceneNaming.retitle)
export function setTitle(scene, title) {
  return retitle(scene, title)
}

export function setId(scene, id) {
  const clean = String(id ?? '').trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^[-_]+|-+$/g, '').slice(0, 40)
  return { ...scene, id: clean || 'scene' }
}

// Смена локации: общие слоты (окно, картина, пол, стол) переносятся, свои слоты
// локации — пустые (fillDefaults — заполнить набором по умолчанию из sceneMigrate)
export function setLocation(scene, location, { fillDefaults = false } = {}) {
  if (!slotsFor(location).length || location === scene.location) return scene
  const slots = fillDefaults ? defaultSlots(location) : emptySlots(location)
  for (const id of COMMON_SLOT_IDS) if (scene.slots?.[id] !== undefined) slots[id] = scene.slots[id]
  return normalizeSceneV2({ ...scene, location, slots })
}

// Поставить/убрать предмет. Убрали опору (стол) — зависимые слоты (needs) очищаются,
// чтобы предметы не висели в воздухе
export function setSlot(scene, slotId, spriteId) {
  const defs = slotsFor(scene.location)
  if (!defs.some(d => d.id === slotId)) return scene
  const slots = { ...scene.slots, [slotId]: spriteId || null }
  if (!spriteId) for (const d of defs) if (d.needs === slotId) slots[d.id] = null
  return { ...scene, slots }
}

export function clearSlots(scene) {
  return { ...scene, slots: emptySlots(scene.location) }
}

export function fillDefaultSlots(scene) {
  return { ...scene, slots: defaultSlots(scene.location) }
}

export function updateCharacter(scene, key, patch) {
  if (key !== 'a' && key !== 'b') return scene
  const cur = scene.characters[key]
  return { ...scene, characters: { ...scene.characters, [key]: { ...cur, ...patch } } }
}

// Образ персонажа: skin 'kit' | 'mia' | 'mia2' — маскот, null — обычный кот. Маскот приходит со своим полом и именем; переключатели
// реакции зрачков и дополнительной мимики по умолчанию включены. Возврат к обычному коту убирает поля маскота, а лица (face / react)
// реплик — только у реплик, где они относились к этому персонажу
export function setSkin(scene, key, skin) {
  if (key !== 'a' && key !== 'b') return scene
  const cur = scene.characters[key]
  const { skin: _skin, pupilReaction: _pupils, extraFace: _extra, ...rest } = cur
  const next = isSkin(skin)
    ? { ...rest, skin, gender: MASCOT_PACKS[skin].gender, name: MASCOT_PACKS[skin].title, pupilReaction: true, extraFace: true }
    : rest
  const timeline = (scene.timeline ?? []).map(l => {
    const field = l.who === key ? 'face' : 'react'
    if (!(field in l)) return l
    const { [field]: _dropped, ...kept } = l
    return kept
  })
  return { ...scene, characters: { ...scene.characters, [key]: next }, timeline }
}

export function setPaletteColor(scene, key, colorKey, value) {
  const cur = scene.characters[key]
  return updateCharacter(scene, key, { palette: { ...cur.palette, [colorKey]: value } })
}

export function applyPalettePreset(scene, key, presetId) {
  const preset = PALETTE_PRESETS[presetId]
  return preset ? updateCharacter(scene, key, { palette: { ...preset } }) : scene
}

// Какой пресет совпадает с палитрой персонажа (для подсветки кнопки), null — свой набор
export function matchPreset(palette) {
  for (const [id, p] of Object.entries(PALETTE_PRESETS)) {
    if (Object.keys(p).every(k => (palette?.[k] ?? '').toLowerCase() === p[k].toLowerCase())) return id
  }
  return null
}

export function setVoice(scene, key, patch) {
  const cur = scene.characters[key]
  const voice = { ...cur.voice, ...patch }
  // Пустой id голоса (ElevenLabs / голос перевода) — поле убирается: «голос проекта» / «как у сцены»
  for (const k of ['voiceId', 'translationVoiceId']) if (voice[k] !== undefined && !String(voice[k]).trim()) delete voice[k]
  return updateCharacter(scene, key, { voice })
}

// Булевы опции (autoplay, loop, bubbles). Режимы показа/озвучки — modes/sceneModes.js
export function setOption(scene, name, value) {
  return { ...scene, options: { ...scene.options, [name]: !!value } }
}

export function setTimeline(scene, timeline) {
  return { ...scene, timeline }
}

// Номер реплики задания после правки таймлайна: ссылка не должна повиснуть за краем (валидатор ругнулся бы
// «task.lineIndex — реплики №N нет»). removed — какую реплику убрали (сдвиг), null — только обрезка по длине.
// «Автоматически» (null) остаётся как есть
function fixTaskLine(scene, removed = null) {
  const li = scene.task?.lineIndex
  if (!Number.isInteger(li)) return scene
  const next = removed != null && li > removed ? li - 1 : removed === li ? null : li
  const lineIndex = next != null && next >= scene.timeline.length ? null : next
  return lineIndex === li ? scene : { ...scene, task: { ...scene.task, lineIndex } }
}

// Удалить реплику. Можно удалить любую, в том числе последнюю: пустой таймлайн — допустимое состояние ЧЕРНОВИКА
// (линтер покажет ошибку «минимум 2 реплики» — для заданий «Повтори за диктором»/«Ответь коту» достаточно одной, сохранение в библиотеку как публикация/«Применить»/тест заблокированы)
export function removeLine(scene, index) {
  const tl = removeLineOp(scene.timeline, index)
  return tl === scene.timeline ? scene : fixTaskLine({ ...scene, timeline: tl }, index)
}

// «Удалить все реплики»: таймлайн пустой, задание остаётся (его реплика снова «автоматически»)
export function clearTimeline(scene) {
  return scene.timeline.length ? fixTaskLine({ ...scene, timeline: [] }) : scene
}

// Сравнение по смыслу (для флага «есть несохранённое»)
export function sameScene(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function exportJson(scene) {
  return JSON.stringify(scene, null, 2)
}
