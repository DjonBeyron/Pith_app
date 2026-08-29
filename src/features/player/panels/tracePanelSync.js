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

// Тотальная покадровая трасса самого превращения: что двигается, на сколько и
// с какой задержкой между кадрами. Смысл в dt: если он скачет (16 → 40 → 16),
// значит браузер пропускает кадры, и рывок не в цифрах, а в самом рендере.
//
// Пишем всё, что может дёргаться одновременно:
//   клон (позиция и РАЗМЕР — их анимация идёт через layout, не композитор),
//   сетка внутри клона, пузырь-цель, трансформ ленты, два нижних сообщения.
export function traceMorph(ghost, target) {
  const feed = document.querySelector('.playerFeedInner')
  const t0 = performance.now()
  let prev = t0
  let n = 0
  let prevG = null
  let prevLast = null

  const tick = () => {
    const now = performance.now()
    const t = Math.round(now - t0)
    const dt = Math.round(now - prev)
    prev = now

    const g = document.body.contains(ghost) ? ghost.getBoundingClientRect() : null
    const grid = g ? ghost.querySelector('.tableGrid')?.getBoundingClientRect() : null
    const tg = target?.getBoundingClientRect()
    const innerT = feed ? getComputedStyle(feed).transform : '—'
    // matrix(a,b,c,d,tx,ty) — берём ty, это и есть сдвиг ленты
    const ty = innerT.startsWith('matrix') ? Math.round(parseFloat(innerT.split(',')[5])) : 0
    const rows = feed ? [...feed.children].filter(e => e.dataset.pending !== 'true') : []
    const last = rows[rows.length - 1]?.getBoundingClientRect()
    const prevRow = rows[rows.length - 2]?.getBoundingClientRect()

    const dGhost = g && prevG ? Math.round(g.top - prevG.top) : 0
    const dLast = last && prevLast ? Math.round(last.top - prevLast.top) : 0
    prevG = g
    prevLast = last

    pLog(
      `[morph] +${t}мс dt=${dt}`
      + ` | клон top=${g ? Math.round(g.top) : '—'}(${dGhost >= 0 ? '+' : ''}${dGhost})`
      + ` ${g ? Math.round(g.width) : '—'}x${g ? Math.round(g.height) : '—'}`
      + ` | сетка=${grid ? Math.round(grid.top) : '—'}`
      + ` | пузырь=${tg ? Math.round(tg.top) : '—'}`
      + ` | лента ty=${ty}`
      + ` | посл.сообщ=${last ? Math.round(last.top) : '—'}(${dLast >= 0 ? '+' : ''}${dLast})`
      + ` | предпосл=${prevRow ? Math.round(prevRow.top) : '—'}`
    )

    if (++n < 26) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
