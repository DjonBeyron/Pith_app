import { createElement } from 'react'

// Дерево svgTree ({ tag, attrs, children }) → React-элементы. Атрибут class →
// className; остальные (camelCase React-имена и data-*) идут как есть.
// Ключи — порядковые: деревья спрайтов статичны по форме, перестановок нет.

function toProps(attrs, key) {
  const props = { key }
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'class') props.className = v
    else if (k === 'children') props.children = v
    else props[k] = v
  }
  return props
}

export function renderTree(tree, key = 0) {
  if (!tree) return null
  if (Array.isArray(tree)) return tree.map((t, i) => renderTree(t, i))
  const props = toProps(tree.attrs, key)
  if (tree.tag === 'text') return createElement('text', props, tree.attrs.children ?? '')
  return createElement(tree.tag, props, tree.children?.length ? tree.children.map((c, i) => renderTree(c, i)) : null)
}
