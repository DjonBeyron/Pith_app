// Таблица не «исчезает из панели и заново появляется» пузырём в чате: панель
// на месте превращается в сообщение. Меняется КЛОН панели поверх всего
// (position:fixed) — настоящая панель в этот момент уже гаснет и вот-вот
// размонтируется, и вешать на неё анимацию было бы гонкой с React.
//
// Это не «полёт» в буквальном смысле: панель никуда не уезжает и не гаснет.
// Клон СХЛОПЫВАЕТСЯ в форму сообщения — уходит верхняя часть (бокс сборки) и
// низ (кнопка), фон сжимается по бокам до ширины пузыря, углы округляются.
// Сама таблица при этом неподвижна: позиция считается так, чтобы её сетка
// совпала с сеткой в пузыре, поэтому переезда не видно — меняется только
// форма вокруг неё. Раньше клон масштабировался через transform: scale и
// гас по opacity, из-за чего таблица уезжала вниз и подменялась другой.
import { pLog } from '../../../shared/lib/debug.js'

// Короткая запись прямоугольника для лога: важны верх и левый край — именно
// по ним ловится «таблица уехала не туда»
const r = box => box
  ? `${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.width)}x${Math.round(box.height)}`
  : 'нет'

const FLIGHT_MS = 340
// Лишнее сворачивается до превращения — успевает, пока ищется цель
const COLLAPSE_MS = 200
// Предел ожидания, если пузырь так и не встал на место
const SETTLE_LIMIT_MS = 700

// Ждём, пока пузырь не только появится в ленте, но и ПЕРЕСТАНЕТ двигаться.
// По таймеру это делать нельзя: спейсер под панелью, подъём ленты и вставка
// сообщения — три разные анимации с разной длительностью, и любая правка в
// CSS смещала бы замер. Два одинаковых кадра подряд — значит лента устоялась
// и координаты можно брать.
function whenStable(find, cb) {
  const t0 = performance.now()
  let prevTop = null
  let frames = 0
  const tick = () => {
    frames += 1
    const el = find()
    const ms = Math.round(performance.now() - t0)
    if (!el) {
      if (ms > SETTLE_LIMIT_MS) {
        pLog(`[fly] цель НЕ появилась за ${ms}мс (${frames} кадров) — превращения не будет`)
        cb(null); return
      }
      requestAnimationFrame(tick)
      return
    }
    const top = el.getBoundingClientRect().top
    if (prevTop !== null && Math.abs(top - prevTop) < 0.5) {
      pLog(`[fly] цель устоялась за ${ms}мс (${frames} кадров), top=${Math.round(top)}`)
      cb(el); return
    }
    if (ms > SETTLE_LIMIT_MS) {
      pLog(`[fly] ЛИМИТ ${ms}мс: цель всё ещё едет (top ${Math.round(prevTop ?? top)}→${Math.round(top)}) — меряем как есть`)
      cb(el); return
    }
    prevTop = top
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const EASE_COLLAPSE = { duration: COLLAPSE_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }

// Схлопывает блок по высоте и возвращает, на сколько ужалась панель
function collapseBlock(el) {
  const h = el.getBoundingClientRect().height
  const cs = getComputedStyle(el)
  const mt = parseFloat(cs.marginTop) || 0
  const mb = parseFloat(cs.marginBottom) || 0
  if (!h && !mt && !mb) return 0
  const pt = parseFloat(cs.paddingTop) || 0
  const pb = parseFloat(cs.paddingBottom) || 0
  const bt = parseFloat(cs.borderTopWidth) || 0
  const bb = parseFloat(cs.borderBottomWidth) || 0
  el.style.overflow = 'hidden'
  // Сворачиваем блок ЦЕЛИКОМ. Одного height: 0 мало сразу по двум причинам:
  // у боксов сборки задан min-height 44-48px (без его снятия высота не
  // меняется вовсе), а padding и рамка живут отдельно от height — из-за них
  // «свёрнутый» бокс всё равно занимал 18px, и клон садился выше пузыря.
  const zero = {
    height: '0px', minHeight: '0px',
    paddingTop: '0px', paddingBottom: '0px',
    borderTopWidth: '0px', borderBottomWidth: '0px',
    marginTop: '0px', marginBottom: '0px', opacity: 0,
  }
  el.animate([
    {
      height: h + 'px', minHeight: '0px',
      paddingTop: pt + 'px', paddingBottom: pb + 'px',
      borderTopWidth: bt + 'px', borderBottomWidth: bb + 'px',
      marginTop: mt + 'px', marginBottom: mb + 'px', opacity: 1,
    },
    zero,
  ], EASE_COLLAPSE)
  // Конечное состояние дублируем инлайном: анимация держит его через
  // fill: forwards, но перед замером мы её отменяем, а cancel без инлайна
  // возвращает элементу исходные размеры — свёрнутый бокс всплывал обратно
  Object.assign(el.style, zero)
  return h + mt + mb
}

// Панель обязана сначала стать той карточкой, которой ляжет в переписку —
// иначе перетекать геометрией нечему: в чате нет ни кнопки «Проверить», ни
// колонки слов-ловушек, а бокс сборки остаётся только с собранной фразой
// (когда в нём была одна подсказка «Смотри на таблицу…», в чат он не едет).
//
// Верхний блок и нижний ужимают панель по-разному: свернув бокс сверху, надо
// опустить и top, иначе таблица подпрыгнет; кнопка снизу просто убирает
// высоту. Обе поправки идут ОДНОЙ анимацией — иначе клон успевает постоять
// с дырой на месте свёрнутого.
function slimDown(ghost, dropAssembly) {
  ghost.querySelectorAll('.tmExtrasSection, .tdExtrasSection').forEach(el => {
    el.animate([{ opacity: 1 }, { opacity: 0 }], EASE_COLLAPSE)
    el.style.opacity = '0'
  })

  let shrinkTop = 0
  let shrinkBottom = 0
  if (dropAssembly) {
    const box = ghost.querySelector('.tdAssemblyBox, .tmAnswerBox')
    if (box) shrinkTop = collapseBlock(box)
  }
  const btn = ghost.querySelector('.tmCheckBtn')
  if (btn) shrinkBottom = collapseBlock(btn)

  const shrink = shrinkTop + shrinkBottom
  pLog(`[fly] подгонка: верх -${Math.round(shrinkTop)} низ -${Math.round(shrinkBottom)} (dropAssembly=${dropAssembly})`)
  if (!shrink) return
  const rect = ghost.getBoundingClientRect()
  ghost.animate([
    { height: `${rect.height}px`, top: `${rect.top}px` },
    { height: `${rect.height - shrink}px`, top: `${rect.top + shrinkTop}px` },
  ], EASE_COLLAPSE)
  ghost.style.height = `${rect.height - shrink}px`
  ghost.style.top = `${rect.top + shrinkTop}px`
}

export function flyPanelToChat(panelEl, nodeId, { send, reveal, onLanded, dropAssembly = false }) {
  const finish = () => onLanded?.()
  // Без WAAPI (очень старый браузер) — обычное поведение: пузырь просто
  // появляется в чате, без полёта
  if (!panelEl || typeof panelEl.animate !== 'function') {
    send?.(false)
    finish()
    return
  }

  const from = panelEl.getBoundingClientRect()
  const ghost = panelEl.cloneNode(true)
  ghost.classList.add('panelFlyGhost')
  ghost.style.left   = `${from.left}px`
  ghost.style.top    = `${from.top}px`
  ghost.style.width  = `${from.width}px`
  ghost.style.height = `${from.height}px`
  document.body.appendChild(ghost)
  pLog(`[fly] старт: панель ${r(from)}, сетка в панели ${r(panelEl.querySelector('.tableGrid')?.getBoundingClientRect())}`)
  slimDown(ghost, dropAssembly)

  // arriving=true: пузырь встаёт в ленту сразу (держит место под посадку и
  // даёт её замерить), но невидимым — до вызова reveal
  send?.(true)

  whenStable(() => document.querySelector(`[data-table-bubble="${nodeId}"]`), row => {
    const target = row?.querySelector('.playerMsgBubble--table') ?? row
    if (!target) {
      pLog('[fly] пузыря в ленте нет — показываем сообщение без превращения')
      ghost.remove()
      reveal?.()
      finish()
      return
    }
    const to = target.getBoundingClientRect()
    const cs = getComputedStyle(target)

    // Совмещать надо не рамки панели и пузыря, а САМИ СЕТКИ: над таблицей в
    // панели лежит бокс сборки и отступы .tdStage, в пузыре — ничего этого
    // нет. Приземляя панель по её верхнему краю, мы клали таблицу ниже, чем
    // она оказывалась в сообщении, — отсюда скачок на последнем кадре.
    const ghostGrid = ghost.querySelector('.tableGrid')
    const bubbleGrid = target.querySelector('.tableGrid')

    // Снимаем анимации подгонки: их конечное состояние уже продублировано
    // инлайном (см. collapseBlock), поэтому отмена ничего не «отматывает», а
    // замер ниже видит настоящую геометрию, а не кадр анимации
    ghost.getAnimations({ subtree: true }).forEach(a => a.cancel())

    const inner = ghost.querySelector('.tdPanelInner, .tmPanelInner')
    const at = ghost.getBoundingClientRect()

    // FLIP: примеряем конечные размеры и поля молча, замеряем, где при них
    // окажется сетка внутри клона, и только потом считаем, куда его вести
    const keep = { width: ghost.style.width, height: ghost.style.height, maxWidth: inner?.style.maxWidth, padding: inner?.style.padding }
    ghost.style.width = `${to.width}px`
    ghost.style.height = 'auto'
    if (inner) {
      inner.style.maxWidth = 'none'
      inner.style.padding = `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`
    }
    const endBox = ghost.getBoundingClientRect()
    const endGrid = ghostGrid?.getBoundingClientRect() ?? endBox
    const offX = endGrid.left - endBox.left
    const offY = endGrid.top - endBox.top
    const endH = endBox.height   // только для лога: насколько панель толще пузыря
    ghost.style.width = keep.width
    ghost.style.height = keep.height
    if (inner) { inner.style.maxWidth = keep.maxWidth ?? ''; inner.style.padding = keep.padding ?? '' }

    // Куда вести клон, чтобы его сетка легла ровно на сетку сообщения
    const gridTo = bubbleGrid?.getBoundingClientRect() ?? to
    const toLeft = gridTo.left - offX
    const toTop  = gridTo.top - offY

    // Главные числа разбора: если таблица «улетает», смотреть сюда — Δ
    // показывает, на сколько клон просят сместиться, а «сетка» — совпадают
    // ли исходная и целевая сетки по вертикали
    pLog(`[fly] клон ${r(at)} | пузырь ${r(to)}`)
    pLog(`[fly] сетка клона ${r(ghostGrid?.getBoundingClientRect())} → сетка пузыря ${r(gridTo)}${bubbleGrid ? '' : ' (СЕТКИ В ПУЗЫРЕ НЕТ, целимся по пузырю)'}`)
    pLog(`[fly] примерка: бокс ${r(endBox)}, сетка ${r(endGrid)}, отступ сетки внутри ${Math.round(offX)},${Math.round(offY)}, высота ${Math.round(endH)}`)
    pLog(`[fly] цель ${Math.round(toLeft)},${Math.round(toTop)} → Δ ${Math.round(toLeft - at.left)},${Math.round(toTop - at.top)} (минус = вверх/влево)`)

    // Внутренние поля перетекают отдельно: в панели их держит .tdPanelInner /
    // .tmPanelInner (6px 16px 16px), в пузыре — его собственный padding (8px)
    if (inner) {
      const ics = getComputedStyle(inner)
      inner.animate([
        { paddingTop: ics.paddingTop, paddingRight: ics.paddingRight, paddingBottom: ics.paddingBottom, paddingLeft: ics.paddingLeft, maxWidth: ics.maxWidth },
        { paddingTop: cs.paddingTop, paddingRight: cs.paddingRight, paddingBottom: cs.paddingBottom, paddingLeft: cs.paddingLeft, maxWidth: 'none' },
      ], { duration: FLIGHT_MS, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' })
    }

    // Никакого затухания: панель не «улетает и гаснет», а СХЛОПЫВАЕТСЯ в
    // форму сообщения — сжимается фон по бокам, уходит верхняя часть,
    // округляются углы. Таблица внутри при этом стоит на месте: позиция
    // клона подобрана выше так, чтобы его сетка совпала с сеткой пузыря,
    // поэтому видимого переезда нет — только смена формы вокруг неё.
    const anim = ghost.animate([
      {
        left: `${at.left}px`, top: `${at.top}px`,
        width: `${at.width}px`, height: `${at.height}px`,
        borderRadius: '0px',
      },
      {
        left: `${toLeft}px`, top: `${toTop}px`,
        // Высота — как у пузыря, а не как у примерки: под сеткой в панели
        // остаются отступы сцены, которых в сообщении нет. Верх сетки уже
        // совмещён, поэтому лишнее просто отрезается снизу (у клона overflow)
        width: `${to.width}px`, height: `${to.height}px`,
        borderRadius: cs.borderRadius,
      },
    ], { duration: FLIGHT_MS, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' })

    // Клон держится непрозрачным до последнего кадра, а подмена идёт в один
    // приём: пузырь показывается и клон снимается в одном и том же кадре —
    // к этому моменту они совпадают пиксель в пиксель, и мигания нет
    const land = () => {
      const gh = ghost.getBoundingClientRect()
      const tg = target.getBoundingClientRect()
      // Если тут не ноль — ровно на столько картинка прыгнет при подмене
      pLog(`[fly] посадка: клон ${r(gh)}, пузырь ${r(tg)} → расхождение ${Math.round(tg.left - gh.left)},${Math.round(tg.top - gh.top)} высота ${Math.round(tg.height - gh.height)}`)
      reveal?.()
      // Клон снимаем не «через кадр», а когда пузырь ФАКТИЧЕСКИ проявился.
      // reveal — это setState: React коммитит его не в текущем кадре, и клон,
      // снятый раньше коммита, оставлял кадр, где его уже нет, а пузырь ещё
      // скрыт (visibility: hidden). Этот один пустой кадр и читался морганием.
      let tries = 0
      const drop = () => {
        const shown = getComputedStyle(target).visibility !== 'hidden'
        if (shown || tries >= 8) {
          ghost.remove()
          pLog(`[fly] клон снят через ${tries} кадр(ов)${shown ? '' : ' — ПО ЛИМИТУ, пузырь так и не проявился'}`)
          return
        }
        tries += 1
        requestAnimationFrame(drop)
      }
      requestAnimationFrame(drop)
      finish()
    }
    anim.onfinish = land
    anim.oncancel = land
  })
}
