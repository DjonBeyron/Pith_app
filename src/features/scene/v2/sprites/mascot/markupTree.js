// Разметка пакета маскота (строка с <g>/<path>/<ellipse>/<circle>) → деревья svgTree ({ tag, attrs, children }).
// Разметку делает наш же конвейер (scripts/mascot), она плоская и без текста, поэтому хватает простого сканера тегов.
// Имена атрибутов приводятся к camelCase React (stroke-width → strokeWidth), data-* и class остаются как есть.

const TAG_RE = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g
const ATTR_RE = /([\w:-]+)="([^"]*)"/g

function attrKey(name) {
  if (name.startsWith('data-') || name === 'class') return name
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

export function parseMarkup(markup) {
  const root = { children: [] }
  const stack = [root]
  TAG_RE.lastIndex = 0
  let m
  while ((m = TAG_RE.exec(markup ?? ''))) {
    const [, closing, tag, rawAttrs, selfClose] = m
    if (closing) { stack.pop(); continue }
    const attrs = {}
    ATTR_RE.lastIndex = 0
    let a
    while ((a = ATTR_RE.exec(rawAttrs))) attrs[attrKey(a[1])] = a[2]
    const node = { tag, attrs, children: [] }
    stack[stack.length - 1].children.push(node)
    if (!selfClose) stack.push(node)
  }
  return root.children
}

// Дерево, найденное по class (первое совпадение вглубь), — чтобы подменять содержимое групп brows/dc и рот
export function findByClass(trees, cls) {
  for (const t of trees) {
    if ((t.attrs.class ?? '').split(' ').includes(cls)) return t
    const inner = findByClass(t.children, cls)
    if (inner) return inner
  }
  return null
}

export function walk(trees, fn) {
  for (const t of trees) { fn(t); walk(t.children, fn) }
}

// Глубокая копия: пакет разбирается один раз, а каждое состояние правится на своей копии
export function cloneTrees(trees) {
  return trees.map(t => ({ tag: t.tag, attrs: { ...t.attrs }, children: cloneTrees(t.children) }))
}
