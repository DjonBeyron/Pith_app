import { countNodes } from './sprites/svgTree.js'
import { backgroundSprite, characterSprite, getSprite } from './sprites/spriteRegistry.js'
import { slotsFor } from './sprites/slots.js'
import { speakersOf } from './scenePit.js'

// Бюджет узлов SVG на сцену — чтобы на слабых Android не лагало: персонажи
// 2 × ~55 (у одиночной сцены — один, scenePit.js), фон ~10, предметы — остальное. Считается
// то, что реально окажется в DOM: фон + коты (по полу) + каждый занятый слот (обёртка
// <g transform> + дерево предмета). Корневой <svg> и облачки (HTML) не считаются.

export const NODE_BUDGET = 250

// Лицо маскота меняет число узлов (брови, декор, закрытые глаза): бюджет считается по самому тяжёлому лицу, которое персонаж надевает в сцене
function worstFace(scene, key) {
  const c = scene?.characters?.[key]
  const sprite = characterSprite(c)
  if (!c?.skin || !sprite || c.extraFace === false) return undefined
  let worst, max = -1
  for (const l of scene.timeline ?? []) {
    const face = l.who === key ? l.face : l.react
    if (!face) continue
    const n = countNodes(sprite.build({ face, pupilReaction: c.pupilReaction !== false }))
    if (n > max) { max = n; worst = face }
  }
  return worst
}

export function sceneNodeBudget(scene) {
  if (!scene || typeof scene !== 'object') return 0
  const location = scene.location ?? 'office'
  let total = countNodes(backgroundSprite(location)?.build?.() ?? null)
  const chars = scene.characters ?? {}
  for (const key of speakersOf(scene)) {
    const c = chars[key] ?? {}
    const sprite = characterSprite(c)
    if (sprite) total += countNodes(sprite.build({ palette: c.palette, stripes: c.stripes !== false, emotion: 'neutral', face: worstFace(scene, key) }))
  }
  const slots = scene.slots ?? {}
  for (const def of slotsFor(location)) {
    const id = slots[def.id]
    if (!id) continue
    const sprite = getSprite(id)
    if (sprite?.kind === 'prop') total += 1 + countNodes(sprite.build())
  }
  return total
}

// Раскладка бюджета по частям — для подсказки в сборщике сцен (этап 2)
export function sceneNodeBreakdown(scene) {
  const location = scene?.location ?? 'office'
  const background = countNodes(backgroundSprite(location)?.build?.() ?? null)
  const characters = speakersOf(scene).reduce((n, k) => {
    const c = scene?.characters?.[k] ?? {}
    const s = characterSprite(c)
    return n + (s ? countNodes(s.build({ palette: c.palette, stripes: c.stripes !== false, face: worstFace(scene, k) })) : 0)
  }, 0)
  const total = sceneNodeBudget(scene)
  return { background, characters, props: total - background - characters, total, limit: NODE_BUDGET }
}
