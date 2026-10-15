import { treeToString } from './sprites/svgTree.js'
import { backgroundSprite, catSprite, getSprite } from './sprites/spriteRegistry.js'
import { slotsInDrawOrder, CAT_PLACEMENT, catPlacement } from './sprites/slots.js'
import { isSolo } from './scenePit.js'

// Статичный кадр сцены одной СТРОКОЙ разметки (внутренность <svg>): фон → предметы
// по слотам → два кота (одиночная сцена — один по центру) — тот же порядок и те же атрибуты, что у живого рендера
// SceneRenderer (Cat/Props). Зачем: статичный кадр (история ленты, доигравшая
// сцена, соседний слайд, постер) не оживает, и ему не нужны ни fiber-ы React на
// ~190 узлов, ни перерисовка — одна вставка innerHTML (разбор нативный) в разы
// дешевле createElement на каждый узел и не держит в куче JS дерево элементов.
// Класс is-talking и CSS-переменные задержек не нужны: анимаций у статики нет.
// Кэш — по объекту сцены и номеру кадра: SceneModule держит сцену на маунте, так
// что уход рамки в плашку и возврат строку не пересчитывают.

const cache = new WeakMap() // scene -> Map(frameKey -> string)

function placement(who, solo) {
  const p = catPlacement(who, solo)
  return `translate(${p.x} ${p.y}) scale(${CAT_PLACEMENT.scale})`
}

function propsMarkup(scene) {
  return slotsInDrawOrder(scene.location).map(slot => {
    const id = scene.slots?.[slot.id]
    const sprite = id ? getSprite(id) : null
    if (!sprite || sprite.kind !== 'prop') return ''
    const s = slot.scale ?? 1
    return `<g data-slot="${slot.id}" transform="translate(${slot.x} ${slot.y})${s !== 1 ? ` scale(${s})` : ''}">${treeToString(sprite.build())}</g>`
  }).join('')
}

function catMarkup(scene, who, line, solo) {
  const ch = scene.characters[who]
  const emotion = line && line.who === who ? line.emotion : 'neutral'
  const tree = catSprite(ch.gender).build({ palette: ch.palette, stripes: ch.stripes !== false, emotion, flip: who === 'b' })
  return `<g data-who="${who}" class="scn-cat" transform="${placement(who, solo)}">${treeToString(tree)}</g>`
}

// line — реплика кадра (облачко рисует сам рендерер; здесь она нужна только ради эмоции) или null
export function sceneStaticMarkup(scene, line, frameKey = -1) {
  let byFrame = cache.get(scene)
  if (!byFrame) { byFrame = new Map(); cache.set(scene, byFrame) }
  let html = byFrame.get(frameKey)
  if (html === undefined) {
    const solo = isSolo(scene)
    html = treeToString(backgroundSprite(scene.location).build()) + propsMarkup(scene)
      + catMarkup(scene, 'a', line, solo) + (solo ? '' : catMarkup(scene, 'b', line, false))
    byFrame.set(frameKey, html)
  }
  return html
}
