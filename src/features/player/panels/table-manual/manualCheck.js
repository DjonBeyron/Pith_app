import { normalizeAnswerText } from '../../../../shared/lib/tableCellMatch.js'
import { firstMismatchSlot } from '../../../../shared/lib/signalMismatch.js'
import { signalForSlot } from '../../../../shared/lib/signalSlots.js'

function slotMatches(token, expectedToken) {
  return !!token && normalizeAnswerText(token.value) === normalizeAnswerText(expectedToken.value)
}

// Проверка собранной фразы в ручной таблице — вынесено из TableManualPanel.jsx
// (там это была самая длинная функция панели, а сама панель отвечает за
// сборку и разметку). Фабрика, а не хук: вызывается на каждом рендере и
// замыкает свежие assembled/result — ровно так же, как когда функция жила
// прямо в теле компонента.
//
// Порядок движений (эксперимент, см. PROJECT.md «Ручная таблица: панель
// уезжает раньше ответа»): пузыри в чат отсюда НЕ шлём напрямую — отдаём их
// третьим аргументом closePanelWith, а панель сама решает, КОГДА их показать.
// При обычном закрытии — после того как таблица и история уехали вниз; при
// уходе таблицы в чат (галочка «отправить таблицу») — как раньше, ДО
// превращения. Верная ветка стартует закрытие сразу, одним тиком с салютом;
// неверная финальная ждёт 600мс, чтобы ученик увидел тряску и красный итог.
//
// tokens — ожидаемые слоты ответа (deriveAnswerTokens, тот же порядок и
// разбиение, что видит и автор в пикере signals, см. signalSlots.js).
// nodes — все ноды урока (резолв ref сигнала в живую ноду); onSignal(slotIndex,
// node) зовётся, когда у ПЕРВОГО неверного слота есть личный сигнал автора,
// его нода жива, И она ЕЩЁ НЕ срабатывала за этот урок (hasSignalFired) —
// сигнал «бесплатный» (см. PROJECT.md, «Сигналы ошибок»): НЕ тратит попытку
// из трёх и НЕ закрывает панель, дальше этим занимается
// useSignalState.js/TableManualPanel.jsx. Нет сигнала, он уже срабатывал
// раньше, или ссылается на удалённую ноду — ветка ниже работает ровно как
// обычная ошибка, без изменений.
export function makeManualCheck({
  assembled, tokens, answer, tData, wrongCount, timers, xpAmount, onXpEarned,
  setCellMenu, setResult, onAnswered, onAnswerToChat, closePanelWith,
  nodes, onSignal, hasSignalFired,
}) {
  return function check() {
    // Разбор закончен — открытое меню ячейки уже ни к чему
    setCellMenu(null)
    const phrase = assembled.map(t => t.value).join(' ')

    // Сверяем ПОСЛОТОВО (а не строку целиком) — так находим ПЕРВЫЙ неверный
    // слот, для него и смотрим персональный сигнал автора. Сверка по смыслу
    // (тот же normalizeAnswerText, что и в дикторе) — регистр, лишние
    // пробелы/переносы из ячейки и вид апострофа значения не имеют
    const mismatchIdx = firstMismatchSlot(assembled, tokens, slotMatches)

    if (mismatchIdx == null) {
      setResult('correct')
      // XP объявляем СРАЗУ, не дожидаясь пузыря: раньше он стрелял из
      // AnswerBubbles, и при выключенной галочке «отправить ответ ученика»
      // пузырей не было вовсе — значит, и награды за таблицу тоже. Точку
      // старта полёта выберет xpAnchor.js: пузырь, если он появится, иначе
      // последняя нажатая ячейка или слово.
      if (xpAmount > 0) onXpEarned?.(xpAmount)
      // Закрытие стартует В ТОТ ЖЕ тик, что и салют (setResult выше):
      // таблица и история трогаются вниз с первыми искрами, а ответ въезжает
      // в переписку уже на освободившееся место (см. closePanelWith)
      closePanelWith('table_correct', undefined, () => {
        if (phrase.trim()) onAnswerToChat?.(phrase, 'correct')
        // 'hint', не 'correct': это реплика УЧИТЕЛЯ, а не второй ответ
        // ученика — 'correct' рисует её тем же зелёным пузырём справа,
        // что и саму фразу, и получались две «реплики ученика» подряд
        // (тот же баг был у fillBlanksCheck.js, см. PROJECT.md)
        if (tData.responseCorrect?.trim()) onAnswered?.(tData.responseCorrect, 'hint')
      })
      return
    }

    // Ошибка — сначала смотрим, не назначен ли ИМЕННО этому слоту личный
    // сигнал автора, и не срабатывал ли он уже раньше за этот урок (сигнал
    // бесплатный только ОДИН раз — дальше та же ошибка идёт обычным путём)
    const found = signalForSlot(tData.signals, mismatchIdx, nodes)
    if (found && !hasSignalFired?.(found.node.id)) {
      onSignal?.(mismatchIdx, found.node)
      return
    }

    wrongCount.current += 1
    setResult('wrong')
    // Собранная (неверная) фраза — СПРАВА, красным, от лица ученика, на
    // КАЖДОЙ попытке, кроме последней (та уходит в чат отдельно, ниже, по
    // галочке «отправить ответ» — здесь не дублируем). Только следом —
    // подсказка учителя обычным цветом ('hint', не 'wrong': красный
    // оставлен только за ответом ученика, самой подсказке он не идёт).
    if (wrongCount.current < 3 && phrase.trim()) onAnswered?.(phrase, 'wrong_final')
    if (wrongCount.current === 1 && tData.responseWrong?.trim()) {
      onAnswered?.(tData.responseWrong, 'hint')
    }
    if (wrongCount.current >= 3) {
      const variantId = assembled.find(t => t.distractorId)?.distractorId ?? null
      // 600мс — чтобы ученик увидел тряску и красный итог в самой панели;
      // дальше тот же порядок, что и у верного ответа: сперва уезжает
      // панель, потом пузыри
      const id = setTimeout(() => {
        closePanelWith('table_wrong', variantId, () => {
          // Именно последняя попытка — её ученик и видит в переписке
          if (phrase.trim()) onAnswerToChat?.(phrase, 'wrong_final')
          // Правильный ответ — раскрытие подсказкой учителя (не «от лица
          // ученика»: это была ошибка — answer сюда попадал с тем же
          // 'wrong_final', то есть красным и СПРАВА, как будто ученик сам
          // ответил верно, хотя как раз нет)
          if (answer.trim()) onAnswered?.(answer, 'hint')
        })
      }, 600)
      timers.current.push(id)
      return
    }
    const id = setTimeout(() => setResult(null), 700)
    timers.current.push(id)
  }
}
