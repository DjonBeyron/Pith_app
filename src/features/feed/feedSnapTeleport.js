import { fdbg } from '../../shared/lib/feedDebug.js'
import { traceEvent } from './feedScrollTrace.js'

// Телепорт круга ленты: перенос scrollTop с ВЫКЛЮЧЕННЫМ scroll-snap.
// (iOS Safari на программный scrollTop в snap-контейнере запускает
// «доснэпливание» и скролл улетает к краям — получалась вечная драка.)
//
// Главное здесь — КОГДА включать snap обратно. Раньше это делал двойной rAF
// вслепую, и на старте ленты выходило так (лог DBG-трассировщика):
//   [0.00] ТЕЛЕПОРТ init: 0 → 81200
//   [0.03] snap→on (снап был выключен 32мс)
//   [0.05] САМ СДВИГ 81200 → 1624 (-98 слайдов)
// scrollHeight при этом целый — позицию уволок сам `scroll-snap: y mandatory`:
// виртуализатор ещё не отрисовал слайды возле новой позиции, snap-точек там
// не было, и браузер приклеился к ближайшей существующей — у начала круга.
// Дальше лента стояла у края запаса циклов, и ПЕРВЫЙ ЖЕ свайп попадал в
// аварийный recentre('edge') — телепорт на 100 слайдов прямо под пальцем.
// Это и было «дёрганье, будто перелистнулось», заметное сразу после входа.
//
// Поэтому теперь snap включается только когда слайд с нужной позицией реально
// есть в DOM, и после включения позиция ещё сторожится.

const SNAP_WAIT_MS = 400 // сколько ждём отрисовку слайдов у новой позиции
const HARD_RESTORE_MS = 700 // страховка: rAF не переживает заморозку в фоне
const GUARD_MS = 300 // сколько сторожим позицию после включения снапа

// Куда перенести ленту, когда высота вьюпорта сменилась: тот же слайд, но в
// новом шаге круга. Позиция между слайдами (остаток от старого шага) теряется
// намеренно — снап всё равно доведёт её до края, и лучше до правильного
export function keepSlideOnResize(scrollTop, prevH, nextH) {
  if (!prevH || !nextH) return scrollTop
  return Math.round(scrollTop / prevH) * nextH
}

// Какой слайд круга показать после пересборки списка. Круг пересобирается не
// только по фильтру: startedIds приезжают с сервера уже ПОСЛЕ первого кадра
// ленты (useFeedSocial), начатые модули вырезаются из рекомендаций, len
// меняется — и раньше лента всегда вставала на модуль №0, то есть первый
// слайд подменялся сам собой через секунду после входа. Держим тот же модуль;
// его нет в новом списке (сам его и начал) — встаём на начало, как раньше.
// keepId игнорируется при повороте из поиска: там pinned-модуль уже первый
export function pickSlideAfterRebuild(ids, keepId, len, cycles) {
  const base = len * Math.floor(cycles / 2)
  const idx = keepId ? ids.indexOf(keepId) : -1
  return idx >= 0 ? base + idx : base
}

export function createTeleporter() {
  let teleporting = false
  // Номер последнего телепорта: доводить дело до конца имеет право только он.
  // Иначе два телепорта подряд (реальный случай при старте: len меняется с 4
  // на 3, пока догружаются начатые модули, и init срабатывает дважды с
  // разницей ~30мс) дрались друг с другом и snap оставался выключен навсегда —
  // лента листалась свободным скроллом без фиксации на видео
  let token = 0
  // Заморозка, пока лента не на экране (см. useFeedOffscreenFreeze.js):
  // { target } — позиция, которую держим; null — лента на экране
  let frozen = null

  function isTeleporting() { return teleporting }
  function isFrozen() { return !!frozen }
  // Страховки хука (возврат из фона, самопочинка snap) не имеют права снимать
  // заморозку — иначе snap включится на скрытой ленте, и всё начнётся заново
  function clearTeleporting() { if (!frozen) teleporting = false }

  // Есть ли в DOM слайд, чей верх стоит ровно на нужной позиции = появилась ли
  // snap-точка, к которой браузеру можно прилипнуть. Слайды сдвинуты
  // transform'ом (position:absolute; top:0), поэтому меряем по rect, а не по
  // offsetTop — у всех он ноль
  function snapPointReady(el, target) {
    const base = el.getBoundingClientRect().top - el.scrollTop
    for (const it of el.querySelectorAll('.feedVirtualItem')) {
      if (Math.abs(it.getBoundingClientRect().top - base - target) <= 1) return true
    }
    return false
  }

  // Сторож после включения снапа. Возвращаем только БОЛЬШОЙ уход (больше
  // полутора экранов): доснэпливание на сотню-другую пикселей — нормальная
  // работа браузера и настоящий свайп пользователя, их трогать нельзя
  function guard(el, target, myToken, viewH) {
    const until = performance.now() + GUARD_MS
    const limit = Math.max(viewH * 1.5, 200)
    function tick() {
      if (myToken !== token) return
      if (Math.abs(el.scrollTop - target) > limit) {
        fdbg('snap увёл ленту:', el.scrollTop.toFixed(0), '→ возвращаю', target.toFixed(0))
        traceEvent('СНАП УВЁЛ', `${el.scrollTop.toFixed(0)} → возвращаю на ${target.toFixed(0)}`)
        el.style.scrollSnapType = 'none'
        el.scrollTop = target
        // Одна попытка: к этому моменту слайды уже отрисованы и позиция держится
        requestAnimationFrame(() => { if (myToken === token) el.style.scrollSnapType = '' })
        return
      }
      if (performance.now() < until) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  // Лента ушла с экрана. Порядок важен: СНАЧАЛА выключить snap, потом ставить
  // scrollTop. Наоборот (как было в 3.2.1706) iOS Safari на программный
  // scrollTop в mandatory-контейнере запускает «доснэпливание», и лента
  // улетает — лог с iPhone: ровно по 812px за кадр, слайд 142 → 197, без
  // пальца, пока лента скрыта и после возврата, до аварийного телепорта.
  // Snap так и остаётся выключенным всё время, пока лента не на экране: к
  // visibility:hidden он по спеке всё равно не применяется, а включать его
  // обратно здесь — ровно та ловушка. Отменяем и недоигранный телепорт
  function freeze(el, target) {
    token++
    frozen = { target }
    teleporting = true
    el.style.scrollSnapType = 'none'
    el.scrollTop = target
  }

  // Скрытая лента всё-таки сдвинулась (прилетело событие scroll) — возвращаем.
  // Snap выключен, поэтому программный scrollTop тут безопасен
  function holdFrozen(el) {
    if (!frozen || Math.abs(el.scrollTop - frozen.target) <= 1) return false
    traceEvent('ДЕРЖУ СКРЫТУЮ', `${el.scrollTop.toFixed(0)} → ${frozen.target.toFixed(0)}`)
    el.scrollTop = frozen.target
    return true
  }

  // Лента вернулась на экран — полноценный телепорт на замороженную позицию:
  // он будит виртуализатор, включает snap только по отрисованным слайдам и
  // ещё 300мс сторожит позицию. Всегда, даже если позиция вроде бы на месте:
  // на iOS хвост недоигранной snap-анимации без этого продолжался
  function unfreeze(el, why, viewH, onIndex) {
    const target = frozen ? frozen.target : el.scrollTop
    frozen = null
    teleport(el, target, why, viewH, onIndex)
  }

  // onIndex — хук ленты обновляет им активный слайд под новую позицию
  function teleport(el, target, why, viewH, onIndex) {
    // Телепорт, пока лента заморожена (пересборка круга или аварийный перенос
    // в фоне): только переносим замороженную позицию, snap не трогаем —
    // он включится при возврате (unfreeze)
    if (frozen) {
      traceEvent('ТЕЛЕПОРТ (скрыта)', `${why}: ${el.scrollTop.toFixed(0)} → ${target.toFixed(0)}`)
      frozen.target = target
      el.scrollTop = target
      el.dispatchEvent(new Event('scroll'))
      if (viewH > 0) onIndex(Math.round(target / viewH))
      return
    }
    fdbg('teleport', why + ':', el.scrollTop.toFixed(0), '→', target.toFixed(0))
    traceEvent('ТЕЛЕПОРТ', `${why}: ${el.scrollTop.toFixed(0)} → ${target.toFixed(0)} (${((target - el.scrollTop) / (viewH || 1)).toFixed(2)} слайда)`)
    teleporting = true
    el.style.scrollSnapType = 'none'
    el.scrollTop = target
    // Программная установка scrollTop НЕ порождает события scroll (проверено
    // в браузере: 0 событий при изменившемся scrollTop). Из-за этого
    // виртуализатор TanStack не узнавал о переносе и продолжал держать в DOM
    // слайды старой позиции — у новой не было ни одной snap-точки, и
    // mandatory-снап утаскивал ленту обратно к началу круга. Будим его сами:
    // после этого события слайды у новой позиции появляются за кадр-другой
    el.dispatchEvent(new Event('scroll'))
    if (viewH > 0) onIndex(Math.round(target / viewH))

    const myToken = ++token
    const started = performance.now()
    let done = false

    function restore(force) {
      if (myToken !== token || done) return
      const waited = performance.now() - started
      const ready = snapPointReady(el, target)
      // Слайдов у новой позиции ещё нет — ждём следующий кадр. По истечении
      // ожидания включаем всё равно: залипший scrollSnapType:none хуже
      // (лента листается свободным скроллом, без фиксации на видео)
      if (!force && !ready && waited < SNAP_WAIT_MS) {
        requestAnimationFrame(() => restore(false))
        return
      }
      done = true
      // Позицию могло сдвинуть, пока ждали — включаем снап только на правильной
      if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target
      traceEvent('snap→on', `после телепорта ${why}: ждали ${waited.toFixed(0)}мс, слайды ${ready ? 'на месте' : 'ЕЩЁ НЕ ОТРИСОВАНЫ'}`)
      el.style.scrollSnapType = ''
      teleporting = false
      guard(el, target, myToken, viewH)
    }

    requestAnimationFrame(() => requestAnimationFrame(() => restore(false)))
    setTimeout(() => restore(true), HARD_RESTORE_MS)
  }

  return { teleport, isTeleporting, clearTeleporting, freeze, unfreeze, holdFrozen, isFrozen }
}
