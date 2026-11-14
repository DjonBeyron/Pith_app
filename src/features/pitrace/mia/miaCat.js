// Дерево Мии для эпизода (прототип): как у Пита в игре (player/…/wordLaneCatTree.buildCat), но лица Мии — головы нескольких лиц лежат рядом, видна одна; тело и хвост общие.
// Чистая сборка без React и DOM (проверяется тестами). Лица: пафос (по умолчанию), интерес — «ухмылка с взглядом в сторону» не используется (владелец 2026-11-14) — Мия в тишине изредка меняет их (useMiaLife.js). Три лица, а не все семь: бюджет
// узлов сцены (≤ 250): Мия ≈ 85 узлов + ≈ 45 на лишнюю голову; слабое устройство — одно лицо.
import { buildMascot } from '../../scene/v2/sprites/mascot/mascotSprite.js'

export const MIA_FACES = ['pathos', 'interest']
export const NO_TILT = 'transform:rotate(0deg)' // у лиц есть наклон головы, но головы лежат рядом и сменяются перекрёстно — наклон убираем, как у Пита

function straighten(node) {
  if ((node.attrs?.class ?? '').split(' ').includes('mx-tilt')) node.attrs = { ...node.attrs, style: NO_TILT }
  for (const c of node.children ?? []) straighten(c)
}

/** Дерево Мии с головами faces (первая — показана, остальные скрывает useMiaLife); у каждой головы data-face / data-skin */
export function buildMiaCat(faces = MIA_FACES) {
  const trees = faces.map(face => buildMascot('mia2', { face, flip: false }))
  const heads = trees.map((t, i) => {
    const h = t.children.find(c => c.attrs['data-part'] === 'head')
    h.attrs = { ...h.attrs, 'data-skin': 'mia2', 'data-face': faces[i], 'data-mouth': 'closed' }
    straighten(h)
    return h
  })
  const cat = trees[0]
  cat.children = [...cat.children.filter(c => c.attrs['data-part'] !== 'head'), ...heads]
  return cat
}

/** Следующее лицо ≠ текущему по случайному r ∈ [0, 1): чистая функция выбора (тесты) */
export const nextFace = (faces, cur, r) => { const rest = faces.filter(f => f !== cur); return rest.length ? rest[Math.min(rest.length - 1, Math.floor(r * rest.length))] : cur }
