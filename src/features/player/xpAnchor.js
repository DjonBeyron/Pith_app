// Откуда вылетает «+N XP».
//
// Правило одно на все модули: если ответ ученика уходит в переписку — цифра
// стартует от самого пузыря с ответом; если пузыря нет (у ноды выключена
// галочка «отправить ответ ученика», а такое задумано в коротких
// тренировках) — от того места, куда ученик последний раз ткнул: слово,
// ячейка, фото, кнопка варианта.
//
// Раньше каждый модуль решал это по-своему: таблица и фото стреляли от
// пузыря, выбор слова — от кнопки в панели, сборка фразы — от кнопки
// «Проверить». Хуже того, у таблицы без пузыря XP не начислялся вовсе:
// TableModule возвращал null, AnswerBubbles не монтировался, и стрелять было
// некому.
//
// Теперь XP всегда объявляет ПАНЕЛЬ (она одна знает, что ответ верный, и
// знает место тапа), а куда его поставить — решается здесь, уже после.

export const XP_ANCHOR = 'data-xp-anchor'

// Пузырю с ответом достаточно этого атрибута, чтобы стать точкой старта
export function xpAnchor(nodeId) {
  return nodeId == null ? {} : { [XP_ANCHOR]: String(nodeId) }
}

// Куда ученик ткнул последним: слово, ячейка, фото, кнопка варианта. Живёт
// одной переменной на модуль, а не рефом в каждой панели, по двум причинам:
// панель ответа в плеере всегда ровно одна (usePlayerPanelNodes), так что
// делить эту величину не с кем; и ref пришлось бы прокидывать в фабрики
// проверки, а react-hooks/refs это справедливо запрещает — функция, которой
// отдали ref, может прочитать его прямо в рендере.
let lastTap = null

export function rememberTap(rect) {
  if (rect && (rect.width || rect.height || rect.left || rect.top)) lastTap = rect
}

// Сколько ждём пузырь. Он приходит не мгновенно: у таблицы между верным
// ответом и появлением сообщения ~600мс (see manualCheck.js), у выбора слова
// текст реакции — на 700мс позже самого выбора. Не дождались — значит пузыря
// и не будет.
const WAIT_MS = 900
// Когда панель ЗНАЕТ, что пузырь будет (expectBubble), ждём дольше: у выбора
// слова он проявляется через 700мс + спуск панели + въезд 240мс — больше
// 900. А когда знает, что НЕ будет, — не ждём вовсе, цифра летит от тапа сразу
const WAIT_EXPECTED_MS = 2200
// Короткий ответ (< SHORT_LEN знаков) — старт не от центра, а от левой части
// пузыря: пузырь справа, и его центр у короткого слова упирается в край экрана
const SHORT_LEN = 10

function anchorEl(nodeId) {
  const id = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(nodeId)) : String(nodeId)
  return document.querySelector(`[${XP_ANCHOR}="${id}"]`)
}

// Прямоугольник старта по элементу-якорю: САМ пузырь (.playerMsgBubble), а не
// обёртка — обёртка может быть шире текста. Центр rect — точка вылета
// (XpFloat.jsx); для короткого ответа отдаём левую половину пузыря, её центр
// стоит на четверти ширины
export function originRect(el) {
  const bubble = el.matches?.('.playerMsgBubble') ? el : (el.querySelector?.('.playerMsgBubble') ?? el)
  const r = bubble.getBoundingClientRect()
  const len = (bubble.textContent ?? '').trim().length
  if (len < SHORT_LEN) return { left: r.left, top: r.top, width: r.width / 2, height: r.height }
  return r
}

// done(rect) — прямоугольник, от центра которого полетит цифра.
// Пузырь ждём не только до появления, но и до конца его въезда снизу: он
// первые ~200мс ещё едет, и старт от промежуточной точки читался бы как
// «цифра вылетела мимо ответа». Отложенный пузырь (.playerMsgRowArriving,
// стоит в ленте невидимым до ухода панели) — тоже «ещё не готов».
// expectBubble: true — пузырь точно будет (ждём дольше), false — точно не
// будет (не ждём), undefined — не знаем (прежнее ожидание)
export function resolveXpOrigin(nodeId, done, { expectBubble } = {}) {
  const tapRect = lastTap
  if (nodeId == null || expectBubble === false || typeof requestAnimationFrame !== 'function') {
    done(tapRect); return
  }
  const limit = expectBubble ? WAIT_EXPECTED_MS : WAIT_MS
  const t0 = Date.now()
  const tick = () => {
    const el = anchorEl(nodeId)
    const late = Date.now() - t0 > limit
    if (el) {
      const arriving = !!el.closest?.('.playerMsgRowArriving')
      const busy = el.getAnimations
        ? el.getAnimations({ subtree: true }).some(a => a.playState === 'running')
        : false
      if ((!busy && !arriving) || late) { done(originRect(el)); return }
    } else if (late) {
      done(tapRect)
      return
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
