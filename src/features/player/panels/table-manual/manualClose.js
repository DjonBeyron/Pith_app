import { flushSync } from 'react-dom'
import { pLog } from '../../../../shared/lib/debug.js'
import { whenBubbleLanded } from '../whenBubbleLanded.js'

// Закрытие ручной таблицы по итогу проверки — вынесено из TableManualPanel.jsx
// (панель упёрлась в потолок 400 строк). Фабрика, как и makeManualCheck:
// зовётся на каждом рендере и замыкает свежие панельные значения.
//
// sendBubbles(deferred) — что уходит в переписку (собирает manualCheck.js).
// КОГДА показать — решается здесь, по способу закрытия:
//  · обычное закрытие («история знает высоту ответа заранее», PROJECT.md):
//    пузыри встают в ленту НЕВИДИМЫМИ (deferred=true → arriving) тем же
//    тиком, что закрывается панель; раскладка сразу конечная, история едет
//    вниз с панелью ровно до места, где останется, и в момент её остановки
//    хук usePanelRiseDrop зовёт onRevealAnswer — пузыри въезжают снизу, потом
//    onDone. Салют здесь же, одним тиком;
//  · уход таблицы в чат (галочка «отправить таблицу») — пузыри ДО
//    превращения, обычным путём (deferred=false): клон целится в готовую
//    конечную раскладку.
//
// Зовётся ТОЛЬКО на верном ответе и на третьей ошибке — первые две ошибки и
// сигналы автора панель не закрывают (см. manualCheck.js).
export function makeManualClose({
  node, panelRef, panelH, setShow, toChatCtl, rise,
  assembled, result, assembledCellValues,
  onDone, onHeightChange, onSendToChat, onLandedInChat, onRevealAnswer,
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
    if (onSendToChat) {
      // flushSync: пузырь должен ОКАЗАТЬСЯ В DOM до того, как whenBubbleLanded
      // спросит у него анимацию въезда
      if (sendBubbles) flushSync(() => sendBubbles(false))
      whenBubbleLanded(() => flyToChat(trigger, done))
      return
    }
    // Опора и что сделать на остановке истории — хуку; пузыри (невидимые) и
    // закрытие — ОДНИМ тиком, React батчит
    rise.prepareClose({ reveal: { onReveal: () => onRevealAnswer?.(), done } })
    sendBubbles?.(true)
    setShow(false)
    pLog(`[tm] setShow(false) — панель закрывается (trigger=${trigger}), пузыри уже в ленте невидимыми`)
  }
}
