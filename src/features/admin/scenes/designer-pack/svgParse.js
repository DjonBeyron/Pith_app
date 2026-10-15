// Крошечный разбор SVG в дерево { tag, attrs, children } с учётом вложенности — без DOMParser,
// чтобы работать и в браузере, и в vitest (node). Нужен конвертеру «SVG → код спрайта»
// (svgToSpriteCode.js). Не универсальный XML-парсер: комментарии, <!DOCTYPE>, <?xml?> и CDATA
// пропускаются, текст учитывается только внутри <text>. Ошибки вложенности → поле error.

const SKIP_TAGS = new Set(['title', 'desc', 'metadata'])

function parseAttrs(src) {
  const attrs = {}
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let m
  while ((m = re.exec(src))) attrs[m[1]] = decodeEntities(m[2] ?? m[3] ?? '')
  return attrs
}

export function decodeEntities(s) {
  return String(s).replace(/&(amp|lt|gt|quot|apos|#(\d+)|#x([0-9a-f]+));/gi, (all, name, dec, hex) => {
    if (dec) return String.fromCodePoint(Number(dec))
    if (hex) return String.fromCodePoint(parseInt(hex, 16))
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[name.toLowerCase()] ?? all
  })
}

// parseSvg(text) → { root, error }: root — узел <svg> с детьми (title/desc/metadata выброшены)
export function parseSvg(text) {
  const clean = String(text ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<![^>]*>/g, '')
  const re = /<\s*(\/?)([a-zA-Z][\w:.-]*)([^>]*?)(\/?)>/g
  const stack = []
  let root = null
  let last = 0
  let m
  while ((m = re.exec(clean))) {
    const [, closing, tag, attrSrc, selfClose] = m
    const text = clean.slice(last, m.index)
    last = re.lastIndex
    const top = stack[stack.length - 1]
    if (top && top.tag === 'text' && text.trim()) top.attrs.children = (top.attrs.children ?? '') + decodeEntities(text.trim())
    if (closing) {
      if (!top || top.tag !== tag) return { root: null, error: `Непарный закрывающий тег </${tag}>` }
      stack.pop()
      if (!stack.length) break
      continue
    }
    const node = { tag, attrs: parseAttrs(attrSrc), children: [] }
    if (!root) {
      if (tag !== 'svg') return { root: null, error: 'Файл должен начинаться с <svg …>' }
      root = node
    } else if (top) {
      if (!SKIP_TAGS.has(tag)) top.children.push(node)
    }
    if (!selfClose) stack.push(node)
    else if (!stack.length) break
  }
  if (!root) return { root: null, error: 'В тексте нет <svg …>' }
  if (stack.length) return { root: null, error: `Не закрыт тег <${stack[stack.length - 1].tag}>` }
  return { root, error: null }
}
