// Проверка SVG-файла спрайта от дизайнера (этап 2: «Шаблон для дизайнера»):
// checkSpriteSvg(svgText, kind) → список нарушений по-русски. Пустой список —
// файл можно класть в реестр. Без DOMParser (работает и в node-тестах, и в
// браузере): простой сканер тегов. Правила — те же, что у встроенных спрайтов:
// только плоские фигуры, без фильтров/масок/градиентов/картинок/скриптов,
// без внешних ссылок, узлов не больше бюджета, обязательные группы data-part.

export const FORBIDDEN_TAGS = [
  'filter', 'mask', 'clipPath', 'foreignObject', 'script', 'image', 'use', 'style', 'pattern',
  'linearGradient', 'radialGradient', 'animate', 'animateTransform', 'animateMotion', 'set', 'a', 'symbol', 'defs',
]
const ALLOWED_TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'title', 'desc'])
const META_TAGS = new Set(['svg', 'title', 'desc'])

export const SPRITE_KINDS = {
  cat: { maxNodes: 70, viewBox: { w: 200, h: 240 }, requiredParts: ['tail', 'body', 'head', 'eyes', 'mouth'], requiredVisemes: ['closed', 'half', 'open'] },
  prop: { maxNodes: 12, maxW: 360, maxH: 640, requiredParts: [] },
  background: { maxNodes: 16, viewBox: { w: 360, h: 640 }, requiredParts: ['wall', 'floor'] },
}

const NAMED_COLORS = new Set(['black', 'white', 'red', 'green', 'blue', 'gray', 'grey', 'transparent'])
const COLOR_RE = /^(none|currentColor|#[0-9a-f]{3}([0-9a-f]{3}([0-9a-f]{2})?)?|rgba?\([^)]*\)|hsla?\([^)]*\)|var\(--[\w-]+\))$/i
const MAX_BYTES = 64 * 1024

function parseAttrs(src) {
  const attrs = {}
  const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g
  let m
  while ((m = re.exec(src))) attrs[m[1]] = m[3] ?? m[4] ?? ''
  return attrs
}

// Разбор на открывающие теги: [{ tag, attrs, line }]
function scanTags(text) {
  const out = []
  const clean = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<![^>]*>/g, '')
  const re = /<\s*([a-zA-Z][\w:-]*)([^>]*?)\/?>/g
  let m
  while ((m = re.exec(clean))) {
    const before = clean.slice(0, m.index)
    out.push({ tag: m[1], attrs: parseAttrs(m[2]), line: before.split('\n').length })
  }
  return out
}

function checkColor(v) {
  return COLOR_RE.test(v.trim()) || NAMED_COLORS.has(v.trim().toLowerCase())
}

export function checkSpriteSvg(svgText, kind = 'prop') {
  const rules = SPRITE_KINDS[kind]
  const out = []
  if (!rules) return [`Неизвестный тип спрайта '${kind}' (cat | prop | background)`]
  if (typeof svgText !== 'string' || !svgText.trim()) return ['Пустой файл']
  if (svgText.length > MAX_BYTES) out.push(`Файл больше ${MAX_BYTES / 1024} КБ — упростите фигуры`)

  const tags = scanTags(svgText)
  const root = tags[0]
  if (!root || root.tag !== 'svg') return [...out, 'Файл должен начинаться с <svg …>']

  const vb = (root.attrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number)
  if (vb.length !== 4 || vb.some(n => Number.isNaN(n)) || vb[2] <= 0 || vb[3] <= 0) out.push('У <svg> нужен viewBox="x y w h"')
  else if (rules.viewBox && (vb[2] !== rules.viewBox.w || vb[3] !== rules.viewBox.h)) out.push(`viewBox должен быть ${rules.viewBox.w}×${rules.viewBox.h} (сейчас ${vb[2]}×${vb[3]})`)
  else if (rules.maxW && (vb[2] > rules.maxW || vb[3] > rules.maxH)) out.push(`Предмет больше сцены: viewBox до ${rules.maxW}×${rules.maxH}`)

  const parts = new Set()
  const visemes = new Set()
  let nodes = 0
  for (const t of tags) {
    const where = ` (строка ${t.line})`
    if (FORBIDDEN_TAGS.includes(t.tag)) { out.push(`Запрещённый тег <${t.tag}>${where}`); continue }
    if (!ALLOWED_TAGS.has(t.tag)) { out.push(`Неизвестный тег <${t.tag}>${where}`); continue }
    if (!META_TAGS.has(t.tag)) nodes += 1
    if (t.attrs['data-part']) parts.add(t.attrs['data-part'])
    if (t.attrs['data-viseme']) visemes.add(t.attrs['data-viseme'])
    for (const [name, value] of Object.entries(t.attrs)) {
      if (/^on/i.test(name)) out.push(`Обработчик событий ${name} запрещён${where}`)
      if (name === 'href' || name === 'xlink:href') out.push(`Внешняя ссылка ${name} запрещена${where}`)
      if (/url\(/i.test(value)) out.push(`Ссылка url(…) в ${name} запрещена (фильтры, маски, градиенты не поддерживаются)${where}`)
      if (name === 'style' && /filter|clip-path|mask|@import/i.test(value)) out.push(`В style запрещены filter/clip-path/mask${where}`)
      if ((name === 'fill' || name === 'stroke') && !checkColor(value)) out.push(`${name}="${value}" — нужен #rrggbb, rgb(), currentColor или none${where}`)
    }
  }
  if (nodes > rules.maxNodes) out.push(`Узлов ${nodes} > ${rules.maxNodes} для типа '${kind}'`)
  if (nodes === 0) out.push('В файле нет фигур')
  for (const p of rules.requiredParts) if (!parts.has(p)) out.push(`Нет группы data-part="${p}"`)
  if (kind === 'prop' && parts.size === 0) out.push('У предмета должна быть хотя бы одна группа <g data-part="…">')
  for (const v of rules.requiredVisemes ?? []) if (!visemes.has(v)) out.push(`Нет группы рта data-viseme="${v}"`)
  return out
}

// Сводка для бейджа в админке: { ok, nodes, problems }
export function spriteCheckSummary(svgText, kind) {
  const problems = checkSpriteSvg(svgText, kind)
  const nodes = scanTags(typeof svgText === 'string' ? svgText : '').filter(t => ALLOWED_TAGS.has(t.tag) && !META_TAGS.has(t.tag)).length
  return { ok: problems.length === 0, nodes, problems }
}
