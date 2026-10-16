// Разбор плейсхолдеров шаблонных строк ({name}, {name:ru}, {{ }}) — чистая логика без сцены (вынесено из sceneVars.js,
// чтобы сегменты озвучки sceneVarsSegments.js и подстановка не зависели друг от друга по кругу).

const TOKEN_RE = /\{\{|\}\}|\{([A-Za-z0-9_]{1,16})(:ru)?\}|[{}]/g

// Разбор строки на части: { lit } литерал | { name, ru, raw } плейсхолдер | { stray } одиночная скобка.
// {{ и }} уже превращены в литералы { и }
export function tokenizeTemplate(str) {
  const s = typeof str === 'string' ? str : ''
  const out = []
  let last = 0
  for (const m of s.matchAll(TOKEN_RE)) {
    if (m.index > last) out.push({ lit: s.slice(last, m.index) })
    if (m[0] === '{{') out.push({ lit: '{', esc: true })
    else if (m[0] === '}}') out.push({ lit: '}', esc: true })
    else if (m[1]) out.push({ name: m[1], ru: !!m[2], raw: m[0] })
    else out.push({ stray: m[0] })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ lit: s.slice(last) })
  return out
}

// Плейсхолдеры строки: [{ name, ru }] в порядке появления
export const placeholdersOf = str => tokenizeTemplate(str).filter(t => t.name).map(({ name, ru }) => ({ name, ru }))

// Подстановка: pick(name, ru) → строка | null (null — оставить плейсхолдер как есть); {{ }} → { }
export function fillTemplate(str, pick) {
  return tokenizeTemplate(str).map(t => {
    if (t.name) { const v = pick(t.name, t.ru); return typeof v === 'string' ? v : t.raw }
    return t.lit ?? t.stray
  }).join('')
}
