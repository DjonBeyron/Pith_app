// Спрайты конструктора сцен описаны не JSX-ом, а деревом простых объектов:
// { tag, attrs, children }. Одно и то же дерево рисует React (SvgTree.jsx),
// превращается в строку SVG (для проверки spriteCheck, контактного листа и
// экспорта дизайнеру) и считается в узлах (бюджет сцены на слабых Android).
// Разрешены только плоские фигуры: без filter/mask/clipPath/foreignObject —
// это и есть «быстрый SVG» для телефонов, см. spriteCheck.js.

export const ALLOWED_TAGS = new Set([
  'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text',
])

// Короткий конструктор узла: el('rect', { x: 1 }, [...children])
export function el(tag, attrs = {}, children = []) {
  if (!ALLOWED_TAGS.has(tag)) throw new Error(`Тег <${tag}> в спрайтах запрещён`)
  return { tag, attrs, children }
}

// Группа с data-part — именованная часть спрайта (хвост, голова, экран…)
export function part(name, attrs = {}, children = []) {
  return el('g', { 'data-part': name, ...attrs }, children)
}

// Число узлов дерева (включая группы) — то, что реально попадёт в DOM
export function countNodes(tree) {
  if (!tree) return 0
  if (Array.isArray(tree)) return tree.reduce((n, t) => n + countNodes(t), 0)
  return 1 + countNodes(tree.children)
}

function esc(v) {
  return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

// camelCase-атрибуты React (strokeWidth) → SVG (stroke-width)
export function svgAttrName(name) {
  if (name.startsWith('data-') || name.startsWith('aria-')) return name
  return name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)
}

// Дерево → строка разметки (без обёртки <svg>, если не передать viewBox)
export function treeToString(tree) {
  if (!tree) return ''
  if (Array.isArray(tree)) return tree.map(treeToString).join('')
  const attrs = Object.entries(tree.attrs)
    .filter(([k, v]) => k !== 'children' && v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${svgAttrName(k)}="${esc(v)}"`)
    .join('')
  const inner = tree.tag === 'text' ? esc(tree.attrs.children ?? '') : treeToString(tree.children)
  return `<${tree.tag}${attrs}>${inner}</${tree.tag}>`
}

// Полный документ SVG — так спрайт уходит дизайнеру и в контактный лист
export function treeToSvgDocument(tree, { viewBox, width, height }) {
  const size = width && height ? ` width="${width}" height="${height}"` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${size}>${treeToString(tree)}</svg>`
}
