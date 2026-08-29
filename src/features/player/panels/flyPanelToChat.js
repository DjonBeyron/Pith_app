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
import { traceMorph } from './tracePanelSync.js'

// Короткая запись прямоугольника для лога: важны верх и левый край — именно
// по ним ловится «таблица уехала не туда»
const r = box => box
  ? `${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.width)}x${Math.round(box.height)}`
  : 'нет'

// Ровно столько же, сколько едет история (playRelease в useTableToChat):
// клон и переписка должны приехать одновременно
const FLIGHT_MS = 320
// Лишнее сворачивается до превращения — успевает, пока ищется цель
const COLLAPSE_MS = 200
// Предел ожидания, если пузырь так и не встал на место
const SETTLE_LIMIT_MS = 700

// Ждать остановки ленты НЕЛЬЗЯ. Пока распорка отдаёт освободившееся место,
// история ползёт вниз — и всё это время клон висел бы неподвижно поверх неё:
// два независимых движения на экране, которые читаются как хаос. Поэтому
// цель считается сразу, но с поправкой на БУДУЩЕЕ: распорка гарантированно
// уйдёт в ноль, значит пузырь опустится ровно на её нынешнюю высоту.
// Превращение идёт той же длительностью и кривой, что и распорка, — клон
// едет вместе с лентой, а не после неё.
const SPACER_SEL = '.tdSpacer, .tmSpacer'

// Последнее НАСТОЯЩЕЕ сообщение переписки ДО вставки таблицы. Это якорь: он
// не участвует в превращении, поэтому по нему видно, сдвинулась история или
// нет. Пре-рендер за экраном ([data-pending]) как якорь не годится — он висит
// фиксированно под вьюпортом
function anchorRow() {
  const feed = document.querySelector('.playerFeedInner')
  if (!feed) return null
  // Распорка тоже лежит в ленте последним элементом, и она как раз меняет
  // высоту — по ней ничего не измеришь. Якорем берём последнее сообщение
  const rows = [...feed.children].filter(el =>
    el.dataset.pending !== 'true' && !el.matches(SPACER_SEL))
  return rows[rows.length - 1] ?? null
}

// Пузырь появляется в ленте не мгновенно и не сразу на своём месте: send() —
// это setState, а следом PlayerFeed играет ему slide-in и сдвигает соседей
// (FLIP), так что первые ~200 мс он ещё едет. Мерить в этот момент нельзя:
// клон целился в промежуточную точку и приземлялся на 200px мимо.
//
// Но и ждать остановку ВСЕЙ ленты не нужно — распорка теперь держит место до
// посадки, история стоит. Достаточно дождаться, когда отыграет анимация
// самого пузыря и его позиция повторится два кадра подряд.
function whenSettled(find, cb) {
  const t0 = performance.now()
  let frames = 0
  const tick = () => {
    frames += 1
    const el = find()
    const ms = Math.round(performance.now() - t0)
    if (!el) {
      if (ms > SETTLE_LIMIT_MS) {
        pLog(`[fly] цель НЕ появилась за ${ms}мс — превращения не будет`)
        cb(null); return
      }
      requestAnimationFrame(tick)
      return
    }
    // Ждём ТОЛЬКО собственных анимаций пузыря. Ждать, пока он перестанет
    // двигаться, нельзя: лента как раз едет вниз, отдавая место панели, и
    // «стабильной» позиции не будет до конца этого движения — а превращение
    // должно идти вместе с ним, а не после
    const busy = el.getAnimations({ subtree: true }).some(a => a.playState === 'running')
    if (!busy) {
      pLog(`[fly] цель готова за ${ms}мс (${frames} кадров), top=${Math.round(el.getBoundingClientRect().top)}`)
      cb(el); return
    }
    if (ms > SETTLE_LIMIT_MS) {
      pLog(`[fly] ЛИМИТ ${ms}мс: у пузыря всё ещё идут анимации — меряем как есть`)
      cb(el); return
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

// Та же кривая и длительность, что у движения истории (playRelease в
// useTableToChat): превращение и опускание переписки читаются одним
// движением. Кривая с мягким стартом — оба начинаются из покоя
const SPACER_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'

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
// колонки слов-ловушек.
//
// А вот бокс сборки НЕ трогаем: он остаётся и в панели, и в сообщении. Его
// схлопывание было источником всей возни — высота панели менялась прямо перед
// превращением, за ней приходилось двигать верхний край, потом пересчитывать
// цель, а история ловила лишний сдвиг. Ничего не сворачивая сверху, мы
// избавляемся от этого класса проблем: превращение меняет только форму рамки.
function slimDown(ghost) {
  ghost.querySelectorAll('.tmExtrasSection, .tdExtrasSection').forEach(el => {
    el.animate([{ opacity: 1 }, { opacity: 0 }], EASE_COLLAPSE)
    el.style.opacity = '0'
  })

  const btn = ghost.querySelector('.tmCheckBtn')
  const shrink = btn ? collapseBlock(btn) : 0
  pLog(`[fly] подгонка: низ -${Math.round(shrink)} (бокс сборки не сворачиваем)`)
  if (!shrink) return
  const rect = ghost.getBoundingClientRect()
  ghost.animate([
    { height: `${rect.height}px` },
    { height: `${rect.height - shrink}px` },
  ], EASE_COLLAPSE)
  ghost.style.height = `${rect.height - shrink}px`
}

export function flyPanelToChat(panelEl, nodeId, { send, reveal, onLanded, onCompensate, settleLayout, onRelease }) {
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
  slimDown(ghost)

  // Вставка пузыря толкает ленту ВВЕРХ на его высоту (FLIP в PlayerFeed), а
  // снятие распорки тянет её ВНИЗ. Обе правки идут одним setState-батчем,
  // значит одним пересчётом layout — лента при вставке не двигается вовсе.
  //
  // Сколько отдать, знаем точно: строка таблицы занимает в ленте РОВНО высоту
  // панели — так подобраны её поля в table.css (пузырь короче на разницу
  // нижних полос, строка длиннее на отступ сверху). Прежние прикидки по
  // слагаемым («сетка», потом «сетка + бокс + поля») дважды молча расходились
  // с реальностью и каждый раз выливались в рывок истории.
  const expectH = Math.round(from.height)
  pLog(`[fly] компенсация спейсера: пузырь займёт ${expectH}px (вся высота панели)`)

  // Запоминаем, где стояла переписка ДО вставки: удержание ниже считается по
  // фактическому смещению этого сообщения, а не по остатку распорки
  const anchor = anchorRow()
  const anchorWas = anchor ? anchor.getBoundingClientRect().top : null

  // arriving=true: пузырь встаёт в ленту сразу (держит место под посадку и
  // даёт её замерить), но невидимым — до вызова reveal
  send?.(true)
  if (expectH) onCompensate?.(expectH)

  whenSettled(() => document.querySelector(`[data-table-bubble="${nodeId}"]`), row => {
    // Снимаем распорку и тут же удерживаем историю трансформом: раскладка
    // становится конечной, а картинка не меняется. Меряем уже по ней
    const rest = settleLayout ? settleLayout() : 0
    // Насколько история УЖЕ уехала. Вставка пузыря толкает её вверх на его
    // высоту, снятие распорки — вниз на свою; сложились они точно или нет,
    // видно только по якорю. Удерживать надо ровно на эту разницу: держать на
    // остатке распорки (как было раньше) можно, только если оценка высоты
    // пузыря была идеальной, а её промах превращался в прыжок истории вверх
    // на первом же кадре и долгий съезд обратно.
    const anchorNow = anchor && document.body.contains(anchor)
      ? anchor.getBoundingClientRect().top : null
    const drop = (anchorWas != null && anchorNow != null)
      ? Math.round(anchorNow - anchorWas)
      : rest
    pLog(`[fly] раскладка зафиксирована | остаток распорки ${Math.round(rest)}px`
      + ` | якорь ${anchorWas != null ? Math.round(anchorWas) : '—'}→${anchorNow != null ? Math.round(anchorNow) : '—'}`
      + ` | удержание ${drop}px`)
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

    // Раскладка уже приведена к конечному виду (settleLayout ниже по стеку),
    // поэтому пузырь стоит ровно там, где и останется — никаких поправок
    // «на будущее», а значит и никакой гонки с моментом замера
    const gridTo = bubbleGrid?.getBoundingClientRect() ?? to
    const toLeft = gridTo.left - offX
    const toTop  = gridTo.top - offY
    pLog(`[fly] сдвиг таблицы ${Math.round(toTop - at.top)}px (должен быть около нуля)`)

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
      ], { duration: FLIGHT_MS, easing: SPACER_EASE, fill: 'forwards' })
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
    ], { duration: FLIGHT_MS, easing: SPACER_EASE, fill: 'forwards' })

    // Тотальная трасса на время превращения — видно и цифры, и пропуски кадров
    traceMorph(ghost, target)

    // История опускается ровно вместе с превращением: та же длительность и
    // кривая, и оба движения — композитные трансформы, один конвейер.
    // Запускается в том же синхронном блоке, что и снятие распорки с замером,
    // поэтому промежуточное состояние на экран не попадает
    onRelease?.(drop)

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
