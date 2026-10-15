import { parseSvg } from './svgParse.js'

// «Конвертировать SVG в код спрайта»: присланный дизайнером SVG → дерево svgTree ({ tag, attrs,
// children }) → готовый фрагмент JS для реестра (sprites/props*.js: el/part + запись с id, title,
// category, anchor, size, build). Программист вставляет фрагмент, не перенабирая координаты.
// svgToSpriteCode.test.js: встроенные спрайты проходят круг «дерево → SVG → дерево → код → дерево»
// без потерь, а сгенерированный код исполняется и проходит checkSpriteSvg.

const DROP_ATTRS = new Set(['xmlns', 'version', 'id', 'xml:space', 'baseProfile'])
const NUM_RE = /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i
const IDENT_RE = /^[A-Za-z_$][\w$]*$/

// stroke-width → strokeWidth; data-*/aria-* — как есть; xmlns:*/xlink:* — выбрасываются
function attrName(name) {
  if (name.startsWith('data-') || name.startsWith('aria-')) return name
  if (name.includes(':')) return null
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

function convertNode(node, warnings, path) {
  const attrs = {}
  for (const [k, v] of Object.entries(node.attrs)) {
    if (DROP_ATTRS.has(k) || k.startsWith('xmlns')) continue
    const name = attrName(k)
    if (!name) { warnings.push(`${path}: атрибут ${k} выброшен (пространства имён не используются)`); continue }
    if (name === 'style') warnings.push(`${path}: атрибут style лучше развернуть в отдельные атрибуты (fill, stroke…)`)
    attrs[name] = node.tag !== 'text' && NUM_RE.test(v.trim()) ? Number(v) : v
  }
  return { tag: node.tag, attrs, children: node.children.map((c, i) => convertNode(c, warnings, `${path}/${c.tag}[${i}]`)) }
}

// Якорь по viewBox предмета: низ (y0 = -h), центр (y0 = -h/2), верх (y0 = 0); иначе null
export function inferAnchor([, y, , h]) {
  if (y === -h) return 'bottom'
  if (y === 0) return 'top'
  if (Math.abs(y + h / 2) < 0.001) return 'center'
  return null
}

// svgToTree(text) → { tree: [узлы-дети <svg>], viewBox: [x,y,w,h] | null, warnings, error }
export function svgToTree(text) {
  const { root, error } = parseSvg(text)
  if (error) return { tree: null, viewBox: null, warnings: [], error }
  const warnings = []
  const vbRaw = (root.attrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number)
  const viewBox = vbRaw.length === 4 && vbRaw.every(n => Number.isFinite(n)) ? vbRaw : null
  if (!viewBox) warnings.push('У <svg> нет корректного viewBox — размер и якорь придётся задать руками')
  const tree = root.children.map((c, i) => convertNode(c, warnings, `${c.tag}[${i}]`))
  return { tree, viewBox, warnings, error: null }
}

const q = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const key = k => (IDENT_RE.test(k) ? k : q(k))
const attrsCode = attrs => {
  const parts = Object.entries(attrs).map(([k, v]) => `${key(k)}: ${typeof v === 'number' ? v : q(v)}`)
  return parts.length ? `{ ${parts.join(', ')} }` : '{}'
}

// Узел → код el(...) / part(...). Группа с data-part → part('имя', { остальное }, [ … ])
export function treeToCode(node, indent = '  ') {
  if (Array.isArray(node)) return node.map(n => treeToCode(n, indent)).join(`,\n${indent}`)
  const inner = indent + '  '
  const kids = node.children.length ? `, [\n${inner}${treeToCode(node.children, inner)},\n${indent}]` : ''
  if (node.tag === 'g' && node.attrs['data-part']) {
    const { 'data-part': name, ...rest } = node.attrs
    return `part(${q(name)}, ${attrsCode(rest)}${kids})`
  }
  return `el(${q(node.tag)}, ${attrsCode(node.attrs)}${kids})`
}

// Запись реестра предмета для sprites/props*.js. Если корень файла — одна группа data-part,
// она и становится build; иначе все фигуры заворачиваются в part(id)
export function spriteEntryCode({ id, title, category = 'common', anchor, viewBox, tree }) {
  const [, , w, h] = viewBox ?? [0, 0, 0, 0]
  const single = tree.length === 1 && tree[0].tag === 'g' && tree[0].attrs['data-part']
  const body = single
    ? treeToCode({ ...tree[0], attrs: { ...tree[0].attrs, 'data-part': id } }, '    ')
    : `part(${q(id)}, {}, [\n      ${treeToCode(tree, '      ')},\n    ])`
  return [
    '{',
    `  id: ${q(id)}, title: ${q(title)}, category: ${q(category)}, anchor: ${q(anchor ?? 'bottom')}, size: { w: ${w}, h: ${h} },`,
    `  build: () => ${body},`,
    '},',
  ].join('\n')
}

// Всё вместе для инструмента в админке: { code, tree, viewBox, anchor, warnings, error }
export function svgToSpriteCode(text, { id = 'my-prop', title = 'Новый предмет', category = 'common', anchor } = {}) {
  const r = svgToTree(text)
  if (r.error) return { ...r, code: '', anchor: null }
  const inferred = r.viewBox ? inferAnchor(r.viewBox) : null
  const finalAnchor = anchor ?? inferred ?? 'bottom'
  if (r.viewBox && anchor && inferred && anchor !== inferred) r.warnings.push(`viewBox говорит о якоре «${inferred}», выбран «${anchor}» — проверьте точку (0,0)`)
  if (r.viewBox && !inferred) r.warnings.push('viewBox не соответствует ни одному якорю: низ — "x -h w h", центр — "x -h/2 w h", верх — "x 0 w h"')
  return { ...r, anchor: finalAnchor, code: spriteEntryCode({ id, title, category, anchor: finalAnchor, viewBox: r.viewBox, tree: r.tree }) }
}
