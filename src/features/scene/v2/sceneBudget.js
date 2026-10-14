import { countNodes } from './sprites/svgTree.js'
import { backgroundSprite, catSprite, getSprite } from './sprites/spriteRegistry.js'
import { slotsFor } from './sprites/slots.js'

// Бюджет узлов SVG на сцену — чтобы на слабых Android не лагало: персонажи
// 2 × ~55, фон ~10, предметы — остальное. Считается то, что реально
// окажется в DOM: фон + коты (по полу) + каждый занятый слот (обёртка
// <g transform> + дерево предмета). Корневой <svg> и облачки (HTML) не считаются.

export const NODE_BUDGET = 250

export function sceneNodeBudget(scene) {
  if (!scene || typeof scene !== 'object') return 0
  const location = scene.location ?? 'office'
  let total = countNodes(backgroundSprite(location)?.build?.() ?? null)
  const chars = scene.characters ?? {}
  for (const key of ['a', 'b']) {
    const c = chars[key] ?? {}
    const sprite = catSprite(c.gender)
    if (sprite) total += countNodes(sprite.build({ palette: c.palette, stripes: c.stripes !== false, emotion: 'neutral' }))
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
  const characters = ['a', 'b'].reduce((n, k) => {
    const c = scene?.characters?.[k] ?? {}
    const s = catSprite(c.gender)
    return n + (s ? countNodes(s.build({ palette: c.palette, stripes: c.stripes !== false })) : 0)
  }, 0)
  const total = sceneNodeBudget(scene)
  return { background, characters, props: total - background - characters, total, limit: NODE_BUDGET }
}
