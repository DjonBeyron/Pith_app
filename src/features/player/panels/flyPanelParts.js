// Вспомогательная механика превращения панели в сообщение чата — вынесено из
// flyPanelToChat.js, чтобы там остался только сам сценарий полёта. Здесь три
// не связанные друг с другом вещи: поиск якоря в ленте (anchorRow), ожидание
// готовности цели (whenSettled) и подгонка клона под вид пузыря
// (collapseBlock/slimDown).
import { pLog } from '../../../shared/lib/debug.js'

// Короткая запись прямоугольника для лога: важны верх и левый край — именно
// по ним ловится «таблица уехала не туда»
export const r = box => box
  ? `${Math.round(box.left)},${Math.round(box.top)} ${Math.round(box.width)}x${Math.round(box.height)}`
  : 'нет'

// Ровно столько же, сколько едет история (playRelease в useTableToChat):
// клон и переписка должны приехать одновременно
export const FLIGHT_MS = 320
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
export function anchorRow() {
  const feed = document.querySelector('.playerFeedInner')
  if (!feed) return null
  // Распорка тоже лежит в ленте последним элементом, и она как раз меняет
  // высоту — по ней ничего не измеришь. Якорем берём последнее сообщение.
  // Индикатор «печатает» тоже не годится: он вне потока (feed.css) и сдвига
  // истории по нему не видно вовсе — вышел бы drop=0
  const rows = [...feed.children].filter(el => el.dataset.pending !== 'true'
    && !el.matches(SPACER_SEL) && !el.classList.contains('playerWaitingRow'))
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
export function whenSettled(find, cb) {
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
export const SPACER_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)'

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
export function slimDown(ghost) {
  // Из клона вырезается всё, чего в сообщении чата нет вовсе и что дорого
  // обходится ровно в кадры превращения:
  //
  //  · HUD спектра — это сотни узлов-полосок (в логе с iPhone: 267 точек) и,
  //    что хуже, backdrop-filter: blur(6px). Размытие-подложка пересчитывается
  //    каждый кадр поверх едущей ленты — на телефоне это самая тяжёлая часть
  //    всей сцены. Панель к этому моменту и так гасит HUD (setHudVisible(false)
  //    в slideDown), так что визуально ничего не теряется. Удалять безопасно:
  //    .tdHud позиционирован absolute и высоту клона не держит.
  //
  //  · <audio> — клон копирует и его вместе с src, то есть браузер заводит
  //    второй источник на тот же blob прямо во время анимации. Звучать он не
  //    должен и не звучит, но ресурсы на него уходят.
  //
  // Остальное (боксы, сетка) остаётся: оно и есть содержимое пузыря.
  ghost.querySelectorAll('.tdHud, .tmHud').forEach(el => el.remove())
  ghost.querySelectorAll('audio, video').forEach(el => { el.removeAttribute('src'); el.remove() })

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

