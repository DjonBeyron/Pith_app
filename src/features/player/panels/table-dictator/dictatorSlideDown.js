import { pLog } from '../../../../shared/lib/debug.js'

// Возврат сцены на место (.tdTableSection, transition 0.42s в
// table-dictator.css) плюс запас на кадр — раньше этого начинать превращение
// нельзя, иначе клон снимется с уехавшей таблицы
const SLIDE_BACK_MS = 460
// Возврат текста ячеек — это один пересчёт раскладки, кадра хватает с запасом
const RESTORE_MS = 90

// Закрытие панели диктанта: либо уезжает вниз, либо превращается в сообщение
// чата. Вынесено из TableDictatorPanel.jsx — самая длинная функция панели,
// причём цельная по смыслу: «как модуль уходит со сцены».
//
// Фабрика, а не хук: вызывается на каждом рендере и замыкает свежие
// assembled/result/panelH — ровно так же, как когда функция жила прямо в
// теле компонента (её ссылка всё равно каждый кадр клалась в slideDownRef).
export function makeDictatorSlideDown({
  node, panelH, panelRef, timers, releaseRef,
  assembled, extrasAssembled, result, usedCells, toChatCtl,
  onDone, onSendToChat, onLandedInChat, onHeightChange,
  setShow, setHudVisible, setHighlighted, setRevealedIds, setPhase, setChipsVisible,
}) {
  return function slideDown(trigger, variantId) {
    pLog(`[td-auto] slideDown trigger=${trigger}`)
    const done = () => onDone?.(trigger ?? 'table_correct', variantId)

    const leave = () => {
      // Галочка «отправить таблицу в чат»: панель не уезжает вниз, а летит на
      // место своего сообщения в переписке (flyPanelToChat.js). Настоящая
      // панель гаснет сразу — дальше видно её клон, — а следующая нода
      // запускается только после посадки, чтобы её сообщение не обогнало
      // таблицу
      if (onSendToChat) {
        // Пузырь в чате повторяет вид панели: та же собранная фраза и тот же
        // итог проверки. Подсказку «Слушай диктора…» не отдаём — она не часть
        // ответа, только приглашение по ходу разбора
        const sent = {
          words: [...assembled, ...extrasAssembled.map(t => t.value)],
          result,
          // Приглушённые ячейки едут в сообщение как есть: разбор оставил на
          // таблице след, и он часть ответа. Массив, а не Set — sent проходит
          // через setState и сравнение пропсов
          dimmed: [...usedCells],
        }
        toChatCtl.sendToChat(panelRef.current, node.id, {
          send: arriving => onSendToChat(arriving, sent),
          reveal: onLandedInChat,
          done: () => { pLog('[td] села в чат'); done() },
        })
      } else {
        timers.current.push(setTimeout(done, 420))
      }
      // Высоту запоминаем ЗДЕСЬ: к моменту, когда сдвиг реально запустится
      // (useLayoutEffect ниже), распорка уже отдана и panelH обнулён
      if (!onSendToChat) releaseRef.current = panelH
      setShow(false)
      setHudVisible(false)   // панель уезжает вниз — спектр сразу схлопывается (scale к 0), не ждёт onEnded
      setHighlighted(new Set())
      onHeightChange?.(0)
    }

    // Если по ходу разбора появлялись слова вне таблицы, сцена уехала влево и
    // на её месте стоят чипы (phase: 'extras'). В чат таблица должна уйти в
    // своём обычном виде, поэтому сперва возвращаем её на место и только потом
    // начинаем превращение. Панель в этот момент ещё видима — клон снимается с
    // неё, и уехавшая сцена попала бы в него как есть.
    //
    // Состояние берём из DOM, а не из phase: slideDown вызывается из таймеров,
    // и замыкание может держать значение прошлого рендера.
    const slid = panelRef.current?.querySelector('.tdTableSectionSlid')
    if (onSendToChat) {
      // Текст ячеек возвращаем ВСЕГДА. По ходу диктанта ячейки гаснут: out-point
      // слоя убирает их из revealedIds (dictatorPostAudio.js), и к концу разбора
      // часть таблицы стоит без текста. В сообщении же таблица рисуется вообще
      // без гейтинга — там виден весь текст. Не вернув его здесь, мы снимали бы
      // клон с полупустой таблицы, а в чате она внезапно заполнялась.
      // null, а не полный набор: у TableGrid это и означает «показывать всё».
      setRevealedIds(null)
      // Затемнение отработавших ячеек НЕ снимаем. Раньше снимали — потому что
      // сообщение рисовало таблицу без dimmedIds, и без этой строки панель и
      // пузырь отличались яркостью текста. Теперь набор уезжает в сообщение
      // вместе с ответом (sent.dimmed выше), панель и пузырь совпадают сами, а
      // разбор оставляет в переписке свой след — какие ячейки уже прошли.
      // Заодно исчез скачок яркости прямо перед снятием клона.
      if (slid) {
        pLog('[td] возвращаем таблицу на место и текст ячеек перед уходом в чат')
        setPhase(null)
        setChipsVisible(false)
      } else {
        pLog('[td] возвращаем текст ячеек перед уходом в чат')
      }
      timers.current.push(setTimeout(leave, slid ? SLIDE_BACK_MS : RESTORE_MS))
      return
    }
    leave()
  }
}
