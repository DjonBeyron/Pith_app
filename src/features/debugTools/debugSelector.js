// Строит CSS-подобный путь до элемента и снимает "математический" снапшот его
// состояния (rect + ключевые computed-стили) — общее для таймлайна и
// комментариев дебаг-тулбара (mountDebugTools.jsx), чтобы оба ссылались на
// один и тот же элемент одинаково.

export function buildSelector(el) {
  if (!(el instanceof Element)) return ''
  const parts = []
  let node = el
  while (node && node.nodeType === 1 && parts.length < 6) {
    let part = node.tagName.toLowerCase()
    if (node.id) {
      parts.unshift(`${part}#${node.id}`)
      break
    }
    const cls = typeof node.className === 'string'
      ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.')
      : ''
    if (cls) part += `.${cls}`
    const parent = node.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === node.tagName)
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`
    }
    parts.unshift(part)
    node = parent
  }
  return parts.join(' > ')
}

// Стили, которые чаще всего ломаются в визуальных багах (позиционирование,
// анимация, видимость) — не весь getComputedStyle (там сотни свойств шума)
const STYLE_KEYS = [
  'transform', 'opacity', 'left', 'top', 'right', 'bottom', 'width', 'height',
  'position', 'zIndex', 'display', 'visibility', 'overflow',
  'animationName', 'animationDuration', 'animationTimingFunction', 'animationPlayState',
  'transitionProperty', 'transitionDuration',
  'color', 'backgroundColor', 'fontSize', 'lineHeight', 'flex', 'gap',
]

export function snapshotElement(el) {
  if (!(el instanceof Element)) return null
  const rect = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const style = {}
  for (const key of STYLE_KEYS) style[key] = cs[key]
  return {
    selector: buildSelector(el),
    tag: el.tagName.toLowerCase(),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, left: rect.left },
    style,
    dataset: { ...el.dataset },
    text: (el.textContent || '').trim().slice(0, 80),
  }
}
