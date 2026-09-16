import { flushSync } from 'react-dom'
import { normalizeAnswerText } from '../../../../shared/lib/tableCellMatch.js'
import { firstMismatchSlot } from '../../../../shared/lib/signalMismatch.js'
import { buildRevealedText } from '../../../../shared/lib/fillBlanksTemplate.js'
import { whenBubbleLanded } from '../whenBubbleLanded.js'

function blankMatches(value, blank) {
  return !!value && normalizeAnswerText(value) === normalizeAnswerText(blank.answer)
}

// Проверка «Составь предложение» — по образцу table-manual/manualCheck.js, но
// БЕЗ сигналов ошибок (пользователь явно попросил не подключать их сюда, см.
// PROJECT.md) и без отдельной галочки «отправить ответ в чат»: responseCorrect/
// responseWrong сами и есть пузыри ответа (тот же приём, что у table).
//
// Фабрика, а не хук — вызывается на каждом рендере панели и замыкает свежие
// picked/blanks, как manualCheck.js/usePhraseAssembly.js.
//
// picked — {index: выбранный текст}, по одному на каждый пропуск. Сверяем
// ПОСЛОТОВО через общий firstMismatchSlot (та же утилита, что у table и
// «Собери фразу») — находим первый неверно заполненный пропуск; сама позиция
// наружу не идёт (сигналов нет), важен только факт «есть ли ошибка вообще».
//
// onChecked(result) — 'correct'|'wrong', зовётся СИНХРОННО в момент проверки
// (на каждой попытке, включая неокончательные) — мост до статистики/звёзд
// урока (LessonPlayer.jsx), тот же приём, что у onChecked в PhraseAssemblyPanel.
export function makeFillBlanksCheck({
  picked, blanks, tData, wrongCount, timers, xpAmount, onXpEarned,
  setResult, onAnswered, onChecked, closePanelWith,
}) {
  return function check() {
    const actual = blanks.map((_, i) => picked[i] ?? null)
    const mismatchIdx = firstMismatchSlot(actual, blanks, blankMatches)

    if (mismatchIdx == null) {
      setResult('correct')
      onChecked?.('correct')
      if (xpAmount > 0) onXpEarned?.(xpAmount)
      // Та же пауза и flushSync/whenBubbleLanded, что у table-manual: ученик
      // должен успеть увидеть зелёный итог в панели, а пузырь — оказаться в
      // DOM и доехать въездом снизу ПРЕЖДЕ, чем панель тронется закрытием
      // (иначе на один и тот же пузырь ложатся два встречных движения)
      const id = setTimeout(() => {
        flushSync(() => {
          if (tData.responseCorrect?.trim()) onAnswered?.(tData.responseCorrect, 'correct')
        })
        whenBubbleLanded(() => closePanelWith('fill_correct'))
      }, 600)
      timers.current.push(id)
      return
    }

    wrongCount.current += 1
    setResult('wrong')
    onChecked?.('wrong')
    // Подсказка учителя — только на ПЕРВУЮ ошибку (как у table/«Собери
    // фразу»): повторять её слово в слово на второй попытке незачем
    if (wrongCount.current === 1 && tData.responseWrong?.trim()) {
      onAnswered?.(tData.responseWrong, 'hint')
    }
    if (wrongCount.current >= 3) {
      // Полное раскрытие: шаблон со ВСЕМИ верными ответами подставленными,
      // подсказкой учителя (не «от лица ученика» — см. manualCheck.js)
      const revealed = buildRevealedText(tData.template, blanks)
      const id = setTimeout(() => {
        flushSync(() => {
          if (revealed.trim()) onAnswered?.(revealed, 'hint')
        })
        whenBubbleLanded(() => closePanelWith('fill_wrong'))
      }, 600)
      timers.current.push(id)
      return
    }
    // Попытки ещё остались — красная вспышка гаснет, пропуски можно
    // перевыбрать (панель их не чистит, см. FillBlanksPanel.jsx)
    const id = setTimeout(() => setResult(null), 700)
    timers.current.push(id)
  }
}
