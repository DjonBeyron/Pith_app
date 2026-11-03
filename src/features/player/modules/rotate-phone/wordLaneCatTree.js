import { buildMascot } from '../../../scene/v2/sprites/mascot/mascotSprite.js'

// Дерево кота Пита для игры «Повтори за диктором» (WordLaneCat.jsx) — чистая сборка без React и DOM, проверяется тестами.
export const CAT_FACES = ['base', 'love', 'shy'] // лица, которые игра показывает; остальные просьбы react() сводятся к base

// У лица в спрайте есть наклон головы (shy = −2°): в сцене конструктора он плавный, а в игре головы лиц лежат рядом и сменяются
// перекрёстным проявлением — наклонённая голова сдвигала контур до 5 px (скачок головы). В игре контур и якорь головы у всех лиц
// одни: наклон убираем (слой .mx-tilt остаётся — состав детей головы не меняется, меняется только угол)
export const NO_TILT = 'transform:rotate(0deg)'
function straighten(node) {
  if ((node.attrs?.class ?? '').split(' ').includes('mx-tilt')) node.attrs = { ...node.attrs, style: NO_TILT }
  for (const c of node.children ?? []) straighten(c)
}

// Дерево кота: хвост и тело — один раз (у лиц они одинаковые), головы всех лиц — рядом (у каждой свои data-skin / data-face / data-mouth: рот пишется в ту голову, что показана сейчас)
export function buildCat(skin) {
  const trees = CAT_FACES.map(face => buildMascot(skin, { face, flip: false }))
  const heads = trees.map((t, i) => {
    const h = t.children.find(c => c.attrs['data-part'] === 'head')
    h.attrs = { ...h.attrs, 'data-skin': skin, 'data-face': CAT_FACES[i], 'data-mouth': 'closed' }
    straighten(h)
    return h
  })
  const cat = trees[0]
  cat.children = [...cat.children.filter(c => c.attrs['data-part'] !== 'head'), ...heads]
  return cat
}
