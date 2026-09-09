// Выжимка из rrweb-записи: та же лента, но словами и без DOM-снапшотов.
//
// Зачем отдельный файл: полная запись — это мегабайты (только первый снапшот
// страницы тянет под два), и читать её построчно дорого. Плееру снапшоты
// нужны, человеку и Claude — нет: нужен ответ «что и когда изменилось».
// Поэтому запись сохраняется целиком (для перемотки), а рядом ложится этот
// короткий лог — его и читают.

// Потолок строк: у длинного урока мутаций десятки тысяч, а смысл выжимки в
// том, чтобы её можно было прочесть целиком
const MAX_LINES = 2000

// В rrweb узлы живут под числовыми id — «12» вместо «div.chatBubble». Карту
// id → читаемое имя собираем из снапшотов и из добавленных по ходу узлов,
// иначе лог был бы про числа и разобрать его было бы нельзя
function describe(node) {
  if (!node) return '?'
  if (node.type === 3) return '#текст'
  const tag = node.tagName || (node.type === 9 ? '#документ' : '#узел')
  const attrs = node.attributes || {}
  const id = attrs.id ? `#${attrs.id}` : ''
  const cls = typeof attrs.class === 'string' && attrs.class
    ? `.${attrs.class.trim().split(/\s+/).slice(0, 2).join('.')}`
    : ''
  return `${tag}${id}${cls}`
}

function indexNode(node, map) {
  if (!node) return
  if (node.id != null) map.set(node.id, describe(node))
  ;(node.childNodes || []).forEach(child => indexNode(child, map))
}

const name = (map, id) => map.get(id) || `узел#${id}`

// Источники incremental-событий, которые говорят о поведении элементов.
// Движения мыши (source 1) намеренно нет: это тысячи строк ни о чём
const MUTATION = 0
const MOUSE_INTERACTION = 2
const SCROLL = 3
const INPUT = 5

function mutationLines(data, map, push, t) {
  ;(data.adds || []).forEach(a => {
    indexNode(a.node, map)
    push(`${t} + появился ${name(map, a.node?.id)} внутри ${name(map, a.parentId)}`)
  })
  ;(data.removes || []).forEach(r => push(`${t} − исчез ${name(map, r.id)}`))
  ;(data.attributes || []).forEach(a => {
    const changed = Object.entries(a.attributes || {})
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v).slice(0, 80)}`)
      .join(' ')
    push(`${t} ~ ${name(map, a.id)} ${changed}`)
  })
  ;(data.texts || []).forEach(x => push(`${t} ~ текст ${name(map, x.id)} → "${String(x.value).slice(0, 60)}"`))
}

// Что «то же самое, только позже»: элемент + вид изменения. Спектр звука
// (tdHudBar) и полоски аудио перерисовываются каждый кадр, и без схлопывания
// они занимают 94% лога — суть тонет. Схлопываем подряд идущие однотипные
// изменения одного элемента в одну строку со счётчиком и последним значением.
function foldKey(line) {
  const body = line.replace(/^\s*\d+мс /, '')
  // Имя элемента стоит на разном месте у разных видов строк — «+ появился X»,
  // «− исчез X», «~ X attr=». Брать просто первое слово нельзя: тогда ключом
  // становится само «появился», и подряд идущие добавления РАЗНЫХ элементов
  // схлопываются в одну строку (так пропадало появление панели таблицы)
  let m
  if ((m = body.match(/^\+ появился (\S+)/)))  return `+|${m[1]}`
  if ((m = body.match(/^− исчез (\S+)/)))      return `-|${m[1]}`
  if ((m = body.match(/^~ текст (\S+)/)))      return `~t|${m[1]}`
  if ((m = body.match(/^~ (\S+) (\S+?)=/)))    return `~|${m[1]}|${m[2]}`
  if ((m = body.match(/^• (\S+) (\S+)/)))      return `•|${m[1]}|${m[2]}`
  return null   // комментарии и вехи не схлопываем никогда
}

export function buildDigest(events, meta) {
  const map = new Map()
  const lines = []
  let cut = false
  const t0 = events[0]?.timestamp ?? 0
  // Сколько раз подряд повторился последний вид изменения — чтобы дописать
  // «×N» к уже лежащей строке вместо тысячи почти одинаковых
  let lastKey = null
  let lastCount = 0
  const push = line => {
    if (lines.length >= MAX_LINES) { cut = true; return }
    const key = foldKey(line)
    if (key && key === lastKey) {
      lastCount += 1
      // Держим ПОСЛЕДНЕЕ значение: у затухающего спектра важно, чем всё
      // кончилось, а не с чего началось
      lines[lines.length - 1] = `${line}  ×${lastCount}`
      return
    }
    lastKey = key
    lastCount = 1
    lines.push(line)
  }

  for (const e of events) {
    const t = `${String(e.timestamp - t0).padStart(6)}мс`
    if (e.type === 2) { indexNode(e.data?.node, map); push(`${t} ── снимок страницы`); continue }
    if (e.type === 4) { push(`${t} ── загрузка ${e.data?.href || ''} ${e.data?.width}x${e.data?.height}`); continue }
    if (e.type === 5) {
      const p = e.data?.payload || {}
      push(`${t} ★ КОММЕНТАРИЙ: "${p.text}" → ${p.target?.selector || '?'}`)
      continue
    }
    if (e.type !== 3) continue
    const d = e.data || {}
    if (d.source === MUTATION) mutationLines(d, map, push, t)
    else if (d.source === MOUSE_INTERACTION) push(`${t} • клик по ${name(map, d.id)}`)
    else if (d.source === SCROLL) push(`${t} • скролл ${name(map, d.id)} → y=${Math.round(d.y)}`)
    else if (d.source === INPUT) push(`${t} • ввод в ${name(map, d.id)}`)
  }

  return { meta: { ...meta, lines: lines.length, truncated: cut }, log: lines }
}
