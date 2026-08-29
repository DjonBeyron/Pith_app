import { pLog } from '../../../shared/lib/debug.js'

// Покадровая трасса появления/ухода панели ответа — для разбора рассинхрона
// «панель уже поехала, а история ещё нет».
//
// В движении участвуют трое, и каждый живёт своей анимацией:
//   1. сама панель — transform: translateY(100%) → 0, композитится на GPU;
//   2. распорка под лентой — height 0 → panelH, а это уже layout, другой
//      конвейер: замеры в rAF совпадают, а на экране трансформ применён,
//      когда пересчёт высоты ещё нет;
//   3. лента — двигается тем, что распорка отнимает у неё место снизу.
// Трасса пишет их положение каждый кадр, чтобы видеть, кто отстал.
const FRAMES = 16

// Последнее НАСТОЯЩЕЕ сообщение ленты: пре-рендер за экраном ([data-pending])
// висит фиксированно под вьюпортом и как опора не годится
function lastRealRow(feed) {
  if (!feed) return null
  const rows = [...feed.children].filter(el => el.dataset.pending !== 'true')
  return rows.length ? rows[rows.length - 1] : null
}

// Разовый снимок того, чем панель отличается от обычного элемента: полупрозрачность,
// фильтры, маски. Ими объясняется «правый край будто размыт градиентом»
export function tracePanelPaint(label, panelEl) {
  if (!panelEl) return
  const parts = []
  const grab = (el, name) => {
    if (!el) return
    const cs = getComputedStyle(el)
    const odd = [
      cs.opacity !== '1' ? `opacity=${cs.opacity}` : '',
      cs.filter !== 'none' ? `filter=${cs.filter}` : '',
      (cs.maskImage && cs.maskImage !== 'none') ? `mask=${cs.maskImage.slice(0, 60)}` : '',
      (cs.webkitMaskImage && cs.webkitMaskImage !== 'none') ? `webkitMask=${cs.webkitMaskImage.slice(0, 60)}` : '',
      cs.backgroundImage !== 'none' ? `bgImage=${cs.backgroundImage.slice(0, 60)}` : '',
      cs.transform !== 'none' ? `transform=${cs.transform}` : '',
      cs.overflowX !== 'visible' ? `overflowX=${cs.overflowX}` : '',
    ].filter(Boolean)
    const box = el.getBoundingClientRect()
    parts.push(`${name}[${Math.round(box.left)}..${Math.round(box.right)}]${odd.length ? ' ' + odd.join(' ') : ' обычный'}`)
  }
  grab(panelEl, 'панель')
  grab(panelEl.querySelector('.tdPanelInner, .tmPanelInner'), 'inner')
  grab(panelEl.querySelector('.tdStage, .tmStage'), 'сцена')
  grab(panelEl.querySelector('.tdTableSection, .tmTableSection'), 'секция')
  grab(panelEl.querySelector('.tableGrid'), 'сетка')
  pLog(`[paint ${label}] ${parts.join(' | ')}`)
}

export function tracePanelSync(label, panelEl, spacerSel) {
  const t0 = performance.now()
  const feed = document.querySelector('.playerFeedInner')
  let n = 0
  let prevBottom = null

  const tick = () => {
    const ms = Math.round(performance.now() - t0)
    const panel = panelEl?.getBoundingClientRect()
    const spacer = document.querySelector(spacerSel)?.getBoundingClientRect()
    const last = lastRealRow(feed)?.getBoundingClientRect()
    const bottom = last ? Math.round(last.bottom) : null
    const moved = prevBottom !== null && bottom !== null ? bottom - prevBottom : 0
    prevBottom = bottom
    // Зазор между низом последнего сообщения и верхом панели: если он уходит
    // в минус — панель перекрывает текст
    const gap = (panel && bottom !== null) ? Math.round(panel.top - bottom) : null

    pLog(
      `[sync ${label}] +${ms}мс кадр${n}`
      + ` | панель top=${panel ? Math.round(panel.top) : '—'} h=${panel ? Math.round(panel.height) : '—'}`
      + ` | распорка h=${spacer ? Math.round(spacer.height) : '—'}`
      + ` | низ истории=${bottom ?? '—'}${moved ? ` (${moved > 0 ? '+' : ''}${moved})` : ''}`
      + ` | зазор=${gap ?? '—'}${gap != null && gap < 0 ? ' ⚠ ПЕРЕКРЫТИЕ' : ''}`
    )

    if (++n < FRAMES) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

// Покадровая трасса превращения — ГОРИЗОНТАЛЬНАЯ.
//
// Прошлая версия писала только вертикаль и всё округляла, поэтому дрожание
// по горизонтали в ней не было видно в принципе: сдвиг на 0.4px печатался как
// одно и то же целое число два кадра подряд. Здесь всё наоборот — сотые доли
// пикселя и слои слева направо, от клона до последней ячейки.
//
// Что с чем сравнивать. Клон едет намеренно (его left и width анимируются), а
// вот inner, сетка и ячейки обязаны стоять на месте АБСОЛЮТНО: их положение
// на экране не должно меняться ни на сотую. Любое ненулевое Δ у них — это и
// есть дрожь, и по тому, на каком слое она появилась впервые, видно причину:
//   · дрожит inner, а сетка следом  → виноват отступ/ширина внутреннего блока;
//   · inner стоит, дрожит сетка     → пересчёт колонок самой сетки;
//   · всё стоит, дрожит последняя ячейка → округление ширины треков.
function traceMorph(ghost, target) {
  const t0 = performance.now()
  let prev = t0
  let n = 0
  const prevPos = {}

  // Δ от прошлого кадра — печатаем только если оно есть, чтобы глаз цеплялся
  const track = (key, v) => {
    if (v == null) return '—'
    const p = prevPos[key]
    prevPos[key] = v
    const d = p == null ? 0 : v - p
    return `${v.toFixed(2)}${Math.abs(d) > 0.004 ? `(${d > 0 ? '+' : ''}${d.toFixed(2)})` : ''}`
  }

  const tick = () => {
    const now = performance.now()
    const t = Math.round(now - t0)
    const dt = Math.round(now - prev)
    prev = now

    const alive = document.body.contains(ghost)
    const g = alive ? ghost.getBoundingClientRect() : null
    const inner = alive ? ghost.querySelector('.tdPanelInner, .tmPanelInner') : null
    const ib = inner?.getBoundingClientRect()
    const grid = alive ? ghost.querySelector('.tableGrid') : null
    const gr = grid?.getBoundingClientRect()
    const box = alive ? ghost.querySelector('.tdAssemblyBox, .tmAnswerBox') : null
    const bx = box?.getBoundingClientRect()
    // Первая и последняя ячейки: между ними видно, тянется ли сама сетка
    let first = null, last = null
    if (grid) {
      for (const c of grid.children) {
        const r = c.getBoundingClientRect()
        if (!first || r.left < first.left) first = r
        if (!last || r.right > last.right) last = r
      }
    }
    const tg = target?.getBoundingClientRect()
    const innerCs = inner ? getComputedStyle(inner) : null

    pLog(
      `[morph] +${t}мс dt=${dt}`
      + ` | клон L=${track('gL', g?.left)} W=${g ? g.width.toFixed(2) : '—'} T=${g ? g.top.toFixed(2) : '—'}`
      + ` | inner L=${track('iL', ib?.left)} W=${ib ? ib.width.toFixed(2) : '—'}`
      + ` ml=${innerCs ? parseFloat(innerCs.marginLeft).toFixed(2) : '—'}`
      + ` | бокс L=${track('bL', bx?.left)} W=${bx ? bx.width.toFixed(2) : '—'}`
      + ` | сетка L=${track('grL', gr?.left)} W=${gr ? gr.width.toFixed(2) : '—'} T=${gr ? gr.top.toFixed(2) : '—'}`
      + ` | яч1 L=${track('c1', first?.left)} W=${first ? first.width.toFixed(2) : '—'}`
      + ` | яч∞ R=${track('cN', last?.right)}`
      + ` | пузырь L=${tg ? tg.left.toFixed(2) : '—'} T=${tg ? tg.top.toFixed(2) : '—'}`
    )

    if (++n < 26) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

export { traceMorph }

// Разбор «правый край таблицы будто растворён / чем-то перекрыт».
//
// Снимок делается ПОЗЖЕ выезда панели (эффект живёт и в покое), и отвечает на
// три вопроса сразу:
//
//  1. Композитный слой. Слой с дробной позицией браузер сглаживает по краям —
//     край выглядит размытым. Поэтому пишем will-change/transform/filter по
//     всей цепочке и, главное, ДРОБНЫЕ координаты правых краёв: если right
//     нецелый, а devicePixelRatio=1 — это ровно тот случай.
//  2. Перекрытие. elementFromPoint у самого края говорит, кто там сверху на
//     самом деле. Если вместо ячейки таблицы вернётся что-то другое — значит
//     край не «растворён», а закрыт.
//  3. Обрезка. Правый край сетки против правого края её контейнеров: если
//     сетка шире бокса, её последний столбец режется overflow.
function describe(el) {
  if (!el) return 'ничего'
  const cls = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean).slice(0, 3).join('.') : ''
  return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`
}

export function traceTableEdge(panelEl, note = '') {
  if (!panelEl) return
  const grid = panelEl.querySelector('.tableGrid')
  const chain = [
    [panelEl, 'панель'],
    [panelEl.querySelector('.tdPanelInner, .tmPanelInner'), 'inner'],
    [panelEl.querySelector('.tdStage, .tmStage'), 'сцена'],
    [panelEl.querySelector('.tdTableSection, .tmTableSection'), 'секция'],
    [panelEl.querySelector('.tdGridBox, .tmGridBox'), 'бокс'],
    [grid, 'сетка'],
  ]

  pLog(`[edge] ${note} dpr=${window.devicePixelRatio}`)
  for (const [el, name] of chain) {
    if (!el) continue
    const cs = getComputedStyle(el)
    const r  = el.getBoundingClientRect()
    const odd = [
      cs.willChange !== 'auto' ? `will-change=${cs.willChange}` : '',
      cs.transform !== 'none' ? `transform=${cs.transform}` : '',
      cs.filter !== 'none' ? `filter=${cs.filter}` : '',
      cs.backdropFilter && cs.backdropFilter !== 'none' ? `backdrop=${cs.backdropFilter}` : '',
      cs.opacity !== '1' ? `opacity=${cs.opacity}` : '',
      (cs.maskImage && cs.maskImage !== 'none') ? `mask=${cs.maskImage.slice(0, 40)}` : '',
      cs.overflowX !== 'visible' ? `overflowX=${cs.overflowX}` : '',
      cs.contain && cs.contain !== 'none' ? `contain=${cs.contain}` : '',
    ].filter(Boolean)
    pLog(`[edge]   ${name}: right=${r.right.toFixed(2)} width=${r.width.toFixed(2)}`
      + `${Number.isInteger(r.right) ? '' : ' ⚠ДРОБНЫЙ'}${odd.length ? ' | ' + odd.join(' ') : ' | чисто'}`)
  }

  if (!grid) return
  const gb = grid.getBoundingClientRect()
  const y = Math.round(gb.top + gb.height / 2)
  for (const dx of [1, 3, 8]) {
    const x = Math.round(gb.right - dx)
    pLog(`[edge]   точка ${dx}px от края (x=${x}) → ${describe(document.elementFromPoint(x, y))}`)
  }
  // Последняя ячейка справа: не вылезает ли сетка за свой контейнер
  let far = null
  for (const c of grid.children) {
    const r = c.getBoundingClientRect()
    if (!far || r.right > far.right) far = r
  }
  if (far) pLog(`[edge]   последняя ячейка right=${far.right.toFixed(2)} vs сетка ${gb.right.toFixed(2)} (вылет ${(far.right - gb.right).toFixed(2)})`)
}
