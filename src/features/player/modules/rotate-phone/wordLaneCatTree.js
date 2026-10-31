import { buildMascot } from '../../../scene/v2/sprites/mascot/mascotSprite.js'

// Дерево кота Пита для игры «Повтори за диктором» (WordLaneCat.jsx) — чистая сборка без React и DOM, проверяется тестами.
export const CAT_FACES = ['base', 'love', 'shy'] // лица, которые игра показывает; остальные просьбы react() сводятся к base

// Дерево кота: хвост и тело — один раз (у лиц они одинаковые), головы всех лиц — рядом (у каждой свои data-skin / data-face / data-mouth: рот пишется в ту голову, что показана сейчас)
export function buildCat(skin) {
  const trees = CAT_FACES.map(face => buildMascot(skin, { face, flip: false }))
  const heads = trees.map((t, i) => {
    const h = t.children.find(c => c.attrs['data-part'] === 'head')
    h.attrs = { ...h.attrs, 'data-skin': skin, 'data-face': CAT_FACES[i], 'data-mouth': 'closed' }
    return h
  })
  const cat = trees[0]
  cat.children = [...cat.children.filter(c => c.attrs['data-part'] !== 'head'), ...heads]
  return cat
}
