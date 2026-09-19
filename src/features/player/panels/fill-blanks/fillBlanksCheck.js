import { normalizeAnswerText } from '../../../../shared/lib/tableCellMatch.js'
import { firstMismatchSlot } from '../../../../shared/lib/signalMismatch.js'
import { buildRevealedText, buildPickedText } from '../../../../shared/lib/fillBlanksTemplate.js'

export function blankMatches(value, blank) {
  return !!value && normalizeAnswerText(value) === normalizeAnswerText(blank.answer)
}

// Проверка «Составь предложение» — по образцу table-manual/manualCheck.js, но
// БЕЗ сигналов ошибок (пользователь явно попросил не подключать их сюда, см.
// PROJECT.md). Галочка «отправить ответ в чат» — как у table: onAnswerToChat
// зовётся, только если она включена (иначе панель просто её не передаёт),
// responseCorrect/responseWrong — отдельные, ВСЕГДА идущие пузыри с текстом
// автора.
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
//
// setWrongIndices([...]) — ВСЕ неверно заполненные пропуски (не только первый
// слева, в отличие от firstMismatchSlot ниже — тот определяет только сам факт
// ошибки) — они мигают красным в FillBlank.jsx тем же signalBlinkChip, что и
// у «Собери фразу», пока ученик не перевыберет именно этот пропуск.
export function makeFillBlanksCheck({
  picked, blanks, tData, wrongCount, timers, xpAmount, onXpEarned,
  setResult, setWrongIndices, onAnswered, onAnswerToChat, onChecked, closePanelWith,
}) {
  return function check() {
    const actual = blanks.map((_, i) => picked[i] ?? null)
    const mismatchIdx = firstMismatchSlot(actual, blanks, blankMatches)

    if (mismatchIdx == null) {
      setResult('correct')
      onChecked?.('correct')
      // expectBubble — будет ли пузырь в чате (галочка «отправить ответ» или
      // реплика на верный): XP тогда ждёт его и летит от него (xpAnchor.js)
      if (xpAmount > 0) {
        const expectBubble = !!(onAnswerToChat && buildPickedText(tData.template, picked).trim())
          || !!tData.responseCorrect?.trim()
        onXpEarned?.(xpAmount, { expectBubble })
      }
      // 600мс — ученик видит зелёный итог в панели; дальше панель решает, как
      // показать пузыри (closePanelWith → sendBubbles(deferred)): обычно они
      // встают в ленту невидимыми одним тиком с закрытием и проявляются,
      // когда история встала (usePanelRiseDrop)
      const id = setTimeout(() => {
        closePanelWith('fill_correct', deferred => {
          // Собранная фраза — СПРАВА, от лица ученика (AnswerBubbles.jsx,
          // result==='correct') — только если включена галочка «отправить
          // ответ в чат» (onAnswerToChat не передан, если она выключена, см.
          // PlayerPanels.jsx). Следом — responseCorrect автора, если задан.
          const text = buildPickedText(tData.template, picked)
          if (text.trim()) onAnswerToChat?.(text, 'correct', deferred)
          // 'hint', не 'correct': это реплика УЧИТЕЛЯ, а не второй ответ
          // ученика — 'correct' рисует её тем же зелёным пузырём справа,
          // что и саму фразу, и получались две «реплики ученика» подряд
          if (tData.responseCorrect?.trim()) onAnswered?.(tData.responseCorrect, 'hint', deferred)
        })
      }, 600)
      timers.current.push(id)
      return
    }

    wrongCount.current += 1
    setResult('wrong')
    setWrongIndices?.(actual.reduce((acc, v, i) => (blankMatches(v, blanks[i]) ? acc : [...acc, i]), []))
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
        closePanelWith('fill_wrong', deferred => {
          // Последняя (неверная) попытка ученика — СПРАВА, тем же каналом,
          // что и верный ответ выше, только result='wrong_final' (тот же
          // приём, что у table) — тоже только при включённой галочке
          const text = buildPickedText(tData.template, picked)
          if (text.trim()) onAnswerToChat?.(text, 'wrong_final', deferred)
          if (revealed.trim()) onAnswered?.(revealed, 'hint', deferred)
        })
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
