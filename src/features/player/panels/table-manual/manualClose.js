import { flushSync } from 'react-dom'
import { pLog } from '../../../../shared/lib/debug.js'
import { whenBubbleLanded } from '../whenBubbleLanded.js'

// Закрытие ручной таблицы по итогу проверки — вынесено из TableManualPanel.jsx
// (панель упёрлась в потолок 400 строк). Фабрика, как и makeManualCheck:
// зовётся на каждом рендере и замыкает свежие панельные значения.
//
// sendBubbles — что уходит в переписку (собирает manualCheck.js). КОГДА
// показать — решается здесь, по способу закрытия (PROJECT.md, «панель
// уезжает раньше ответа»):
//  · обычное закрытие — сперва панель и история уезжают вниз одним тиком с
//    салютом, потом пузыри въезжают на освободившееся место;
//  · уход таблицы в чат (галочка «отправить таблицу») — пузыри ДО
//    превращения, как и было: клон целится в готовую конечную раскладку.
//
// Зовётся ТОЛЬКО на верном ответе и на третьей ошибке — первые две ошибки и
// сигналы автора панель не закрывают (см. manualCheck.js).
export function makeManualClose({
  node, panelRef, panelH, timers, releaseRef, setShow, toChatCtl,
  assembled, result, assembledCellValues,
  onDone, onHeightChange, onSendToChat, onLandedInChat,
}) {
  // Уход таблицы в переписку целиком
  function flyToChat(trigger, done) {
    pLog(`[tm] уходим в чат: trigger=${trigger} высота панели=${panelH}px слов=${assembled.length}`)
    // Та же собранная фраза и итог проверки уезжают в пузырь — чтобы после
    // посадки таблица в переписке выглядела как только что в панели.
    // picked — какие ячейки ученик выбрал и КАКОЕ значение взял из ячейки со
    // списком вариантов: выбранное в переписке приглушено, а не «как новое».
    // Массив пар, а не Map — sent проходит через setState и сравнение пропсов
    const sent = {
      words: assembled.map(t => t.value),
      result,
      picked: [...assembledCellValues],
    }
    toChatCtl.sendToChat(panelRef.current, node.id, {
      send: arriving => onSendToChat(arriving, sent),
      reveal: onLandedInChat,
      done: () => { pLog('[tm] села в чат'); done() },
    })
    setShow(false)
  }

  return function closePanelWith(trigger, variantId, sendBubbles) {
    const done = () => { onHeightChange?.(0); onDone?.(trigger, variantId) }
    // flushSync: пузырь должен ОКАЗАТЬСЯ В DOM до того, как whenBubbleLanded
    // спросит у него анимацию въезда
    const send = () => { if (sendBubbles) flushSync(sendBubbles) }
    if (onSendToChat) {
      send()
      whenBubbleLanded(() => flyToChat(trigger, done))
      return
    }
    // Высоту запоминаем ЗДЕСЬ: к моменту, когда сдвиг реально запустится
    // (useLayoutEffect в панели), распорка уже отдана и panelH может обнулиться
    releaseRef.current = panelH
    setShow(false)
    pLog(`[tm] setShow(false) — панель закрывается (сдвиг истории ${panelH}px трансформом)`)
    // 300мс = панель 0.28s (.tmPanel) и сдвиг ленты 280мс закончились —
    // раньше пузырь толкал бы вверх ленту, которая ещё опускается. Ноду
    // закрываем после въезда пузыря, чтобы следующее сообщение его не догоняло
    timers.current.push(setTimeout(() => {
      pLog(`[tm] панель уехала (+300мс) → пузыри в чат: ${sendBubbles ? 'есть' : 'нет'}`)
      send()
      whenBubbleLanded(() => { pLog(`[tm] пузырь въехал → onDone(${trigger})`); done() })
    }, 300))
  }
}
