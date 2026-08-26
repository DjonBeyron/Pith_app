import { useEffect, useRef } from 'react'
import { dbg } from '../../shared/lib/debug.js'
import { linkDiagnostics, linkDebugSummary } from './canvasLinkDebug.js'
import { checkNodes, formatIntegrity } from './canvasIntegrity.js'

// Короткая сводка по связям в лог — сама, при каждой смене состава нод.
// «Линий не видно» перестаёт быть вопросом веры: в логе сразу видно, сколько
// переходов задано в данных, сколько путей построено и сколько их реально
// висит в DOM. Пишется только когда состав нод изменился, чтобы не спамить
// на каждое движение мыши.
export function useLinkDebugLog(nodes, triggerMeasures, scaleRef, debugOn = false) {
  const lastRef = useRef(null)

  useEffect(() => {
    if (!nodes?.length) return

    // Целостность графа проверяем ВСЕГДА и молчим, пока всё в порядке: дубли
    // id и связи в никуда ломают переходы и в редакторе, и в плеере, а по
    // экрану этого не видно
    const health = checkNodes(nodes)
    if (!health.ok) dbg('[GRAPH] ⚠', formatIntegrity(health))

    // Подробности — только когда включена «Отладка связей» (меню «⋯»),
    // иначе консоль забивается на каждое движение по холсту
    if (!debugOn) return
    const d = linkDiagnostics(nodes, triggerMeasures)
    const paths = document.querySelectorAll('.canvasBoardSvgBack path').length
    const dots  = document.querySelectorAll('.portDot').length
    const board = document.querySelector('.canvasBoard')?.getBoundingClientRect()
    const size = board ? `${Math.round(board.width)}×${Math.round(board.height)}` : 'нет доски'
    const line = `${linkDebugSummary(d, scaleRef?.current)} · граф ${graphBox(nodes)}` +
      ` · в DOM: ${paths} path, ${dots} портов · доска ${size}`
    if (line === lastRef.current) return
    lastRef.current = line
    dbg('[LINKS]', line)
    dbg('[LINKS]', describeLayers())
    dbg('[LINKS]', domCensus())
    dbg('[DRAW]', drawCensus())
    dbg('[DRAW]', nodeShape(nodes))
    if (d.missingTarget || d.emptyPath) {
      dbg('[LINKS] обрывы:', d.segments.filter(s => !s.ok).slice(0, 5).map(s => s.key).join(', '))
    }
  // Пересчитываем на смену состава нод, а не на каждый рендер холста
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, nodes, debugOn])

  return null
}

// Почему связи не видно, когда они есть в DOM: слой прозрачен, скрыт, пуст по
// размеру — или элементы лежат мимо видимой части холста. Отдельно сверяем
// НОДУ и её порт: если нода в кадре, а порт нет, значит слой нод и слой связей
// считают координаты по-разному.
function describeLayers() {
  const board = document.querySelector('.canvasBoard')
  const back  = document.querySelector('.canvasBoardSvgBack')
  const front = document.querySelector('.canvasBoardSvgFront')
  const b = board?.getBoundingClientRect()
  const info = el => {
    if (!el) return 'нет'
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return `${Math.round(r.width)}×${Math.round(r.height)} opacity ${cs.opacity} ${cs.visibility} ${cs.display} z${cs.zIndex}`
  }
  const hits = el => {
    if (!el || !b) return false
    const r = el.getBoundingClientRect()
    return r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom
  }
  const count = sel => {
    const all = [...document.querySelectorAll(sel)]
    return `${all.filter(hits).length} из ${all.length}`
  }
  const spot = board?.classList.contains('canvasSpotlight') ? 'ДА' : 'нет'
  return [
    `слой связей: ${info(back)}`,
    `слой портов: ${info(front)}`,
    `прожектор: ${spot}`,
    `в кадре: нод ${count('.canvasNodeWrapper')} · портов ${count('.portDotInner')} · линий ${count('.canvasBoardSvgBack path')}`,
    nodeVsPort(hits),
    paintInfo(),
  ].join(' · ')
}

// Первая нода в кадре и её порт: у max-ноды порт стоит у правого края, и если
// они разъехались — виноват не рендер связей, а разные системы координат
function nodeVsPort(hits) {
  const wrap = [...document.querySelectorAll('.canvasNodeWrapper')].find(hits)
  if (!wrap) return 'нод в кадре нет'
  const r = wrap.getBoundingClientRect()
  const dots = [...document.querySelectorAll('.portDotInner')]
    .map(d => ({ d, r: d.getBoundingClientRect() }))
    .sort((a, z) => Math.hypot(a.r.left - r.right, a.r.top - r.top) - Math.hypot(z.r.left - r.right, z.r.top - r.top))
  const near = dots[0]
  if (!near) return `нода ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)} · портов нет`
  const dx = Math.round(near.r.left - r.right)
  const dy = Math.round(near.r.top - r.top)
  return `нода ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)} · ближайший порт смещён на ${dx},${dy}`
}

// Чем и какой толщиной реально красится линия. Элемент может быть в кадре и
// «виден» по стилям слоя, но при нулевой толщине, прозрачном цвете или
// пустой геометрии на экране его нет.
function paintInfo() {
  const path = document.querySelector('.canvasBoardSvgBack path')
  const dot  = document.querySelector('.portDotInner')
  if (!path) return 'линий нет в DOM'
  const cs = getComputedStyle(path)
  let len = -1
  try { len = Math.round(path.getTotalLength()) } catch { /* пустой d */ }
  const dcs = dot ? getComputedStyle(dot) : null
  return [
    `линия: stroke ${cs.stroke} ${cs.strokeWidth} opacity ${cs.opacity} vec ${cs.vectorEffect ?? '—'} длина ${len} d ${(path.getAttribute('d') ?? '').slice(0, 24)}`,
    dot ? `порт: fill ${dcs.fill} r ${dot.getAttribute('r')}/${dcs.r ?? '—'} opacity ${dcs.opacity}` : 'портов нет',
  ].join(' · ')
}

// Перепись всего, что относится к холсту, в DOM. Отвечает на вопрос «а
// отрисовалось ли вообще» — по каждому слою отдельно, включая отладочный.
function domCensus() {
  const count = sel => document.querySelectorAll(sel).length
  const boards = count('.canvasBoard')
  const worlds = count('.canvasBoardWorld')
  return [
    `в DOM всего: досок ${boards}`,
    `миров ${worlds}`,
    `svg ${count('.canvasBoardSvg')}`,
    `нод ${count('.canvasNode')}`,
    `портов ${count('.portDot')}`,
    `путей ${count('.canvasBoardSvgBack path')}`,
    `меток отладки ${count('.canvasLinkDebugMark')}`,
  ].join(' · ')
}

// Габариты графа в мировых координатах. Нужны для сравнения уроков между
// собой: в одном связи видны, в другом нет — и первое, чем они отличаются,
// это размах координат (полотно, которое браузер должен отрисовать).
function graphBox(nodes) {
  if (!nodes?.length) return 'пуст'
  const xs = nodes.map(n => n.x ?? 0)
  const ys = nodes.map(n => n.y ?? 0)
  const x1 = Math.min(...xs), x2 = Math.max(...xs)
  const y1 = Math.min(...ys), y2 = Math.max(...ys)
  return `${Math.round(x1)}..${Math.round(x2)} × ${Math.round(y1)}..${Math.round(y2)}` +
    ` (${Math.round(x2 - x1)}×${Math.round(y2 - y1)})`
}

// Что реально лежит в атрибутах отрисованных элементов. NaN в d пути или в
// координатах точки браузер не рисует молча — по цифрам этого не видно, а
// глазами выглядит как «линий нет».
function drawCensus() {
  const paths = [...document.querySelectorAll('.canvasBoardSvgBack path')]
  const dots  = [...document.querySelectorAll('.portDotInner')]
  const badPath = paths.filter(p => {
    const d = p.getAttribute('d') ?? ''
    return !d || /NaN|Infinity|undefined/.test(d)
  }).length
  const badDot = dots.filter(c => {
    const v = `${c.getAttribute('cx')},${c.getAttribute('cy')},${c.getAttribute('r')}`
    return /NaN|Infinity|undefined|null/.test(v)
  }).length
  // Самый длинный путь и самый большой его габарит: если связь уходит в обход
  // на тысячи пикселей, её концы у нод прячутся под ними, а вся видимая часть
  // оказывается далеко за экраном — выглядит как «линий нет»
  let maxLen = 0, maxBox = '—', maxKey = '—'
  for (const p of paths) {
    let len = 0
    try { len = p.getTotalLength() } catch { /* битый d */ }
    if (len > maxLen) {
      maxLen = len
      try {
        const b = p.getBBox()
        maxBox = `${Math.round(b.width)}×${Math.round(b.height)}`
      } catch { maxBox = '?' }
      maxKey = (p.getAttribute('d') ?? '').slice(0, 30)
    }
  }
  const first = paths[0]?.getAttribute('d') ?? '—'
  const firstDot = dots[0]
  return [
    `путей ${paths.length} (битых ${badPath})`,
    `точек ${dots.length} (битых ${badDot})`,
    `самый длинный путь ${Math.round(maxLen)} (габарит ${maxBox}) от ${maxKey}`,
    `d[0]: ${first.slice(0, 120)}`,
    firstDot ? `точка[0]: cx=${firstDot.getAttribute('cx')} cy=${firstDot.getAttribute('cy')} r=${firstDot.getAttribute('r')}` : 'точек нет',
  ].join(' · ')
}

// Форма данных первой ноды: тип каждого поля. Импортированная и созданная
// руками нода должны быть неотличимы — если где-то строка вместо числа,
// арифметика координат тихо превращается в склейку строк
function nodeShape(nodes) {
  const n = nodes?.[0]
  if (!n) return 'нод нет'
  const t = v => Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v
  const trig = n.triggers?.[0]
  return [
    `нода[0] #${n.seq}: x=${n.x}(${t(n.x)})`,
    `y=${n.y}(${t(n.y)})`,
    `size=${n.size}(${t(n.size)})`,
    `type=${n.type}`,
    `id=${String(n.id).slice(0, 8)}(${t(n.id)})`,
    `триггеров ${n.triggers?.length ?? 0}`,
    trig ? `триггер[0]: if=${trig.if} then=${String(trig.then).slice(0, 8)}(${t(trig.then)})` : 'триггеров нет',
    `ключи: ${Object.keys(n).join(',')}`,
  ].join(' · ')
}
