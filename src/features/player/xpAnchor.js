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

function anchorEl(nodeId) {
  const id = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(nodeId)) : String(nodeId)
  return document.querySelector(`[${XP_ANCHOR}="${id}"]`)
}

// done(rect) — прямоугольник, от центра которого полетит цифра.
// Пузырь ждём не только до появления, но и до конца его въезда снизу: он
// первые ~200мс ещё едет, и старт от промежуточной точки читался бы как
// «цифра вылетела мимо ответа».
export function resolveXpOrigin(nodeId, done) {
  const tapRect = lastTap
  if (nodeId == null || typeof requestAnimationFrame !== 'function') { done(tapRect); return }
  const t0 = Date.now()
  const tick = () => {
    const el = anchorEl(nodeId)
    const late = Date.now() - t0 > WAIT_MS
    if (el) {
      const busy = el.getAnimations
        ? el.getAnimations({ subtree: true }).some(a => a.playState === 'running')
        : false
      if (!busy || late) { done(el.getBoundingClientRect()); return }
    } else if (late) {
      done(tapRect)
      return
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
