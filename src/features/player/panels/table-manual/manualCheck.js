import { flushSync } from 'react-dom'
import { normalizeAnswerText } from '../../../../shared/lib/tableCellMatch.js'
import { whenBubbleLanded } from '../whenBubbleLanded.js'

// Проверка собранной фразы в ручной таблице — вынесено из TableManualPanel.jsx
// (там это была самая длинная функция панели, а сама панель отвечает за
// сборку и разметку). Фабрика, а не хук: вызывается на каждом рендере и
// замыкает свежие assembled/result — ровно так же, как когда функция жила
// прямо в теле компонента.
//
// Задержка перед уходом в чат (600мс) — общая для верной и неверной ветки: ученик
// должен успеть увидеть итог В САМОЙ ПАНЕЛИ, а пузыри и закрытие панели
// должны тронуться одним движением, а не по очереди.
export function makeManualCheck({
  assembled, answer, tData, wrongCount, timers, xpAmount, onXpEarned,
  setCellMenu, setResult, onAnswered, onAnswerToChat, closePanelWith,
}) {
  return function check() {
    // Разбор закончен — открытое меню ячейки уже ни к чему
    setCellMenu(null)
    const phrase = assembled.map(t => t.value).join(' ')
    // Сверяем по смыслу (тот же normalizeAnswerText, что и в дикторе): регистр,
    // лишние пробелы/переносы из ячейки и вид апострофа значения не имеют
    if (normalizeAnswerText(phrase) === normalizeAnswerText(answer)) {
      setResult('correct')
      // XP объявляем СРАЗУ, не дожидаясь пузыря: раньше он стрелял из
      // AnswerBubbles, и при выключенной галочке «отправить ответ ученика»
      // пузырей не было вовсе — значит, и награды за таблицу тоже. Точку
      // старта полёта выберет xpAnchor.js: пузырь, если он появится, иначе
      // последняя нажатая ячейка или слово.
      if (xpAmount > 0) onXpEarned?.(xpAmount)
      // Пузырь с ответом уходит в чат НЕ сразу, а вместе с началом закрытия
      // панели. Эти 600мс нужны, чтобы ученик увидел зелёный итог в самой
      // панели, — но раньше ответ улетал в переписку в первый же миг, а
      // панель трогалась только по их истечении. На экране это читалось как
      // «ответ уехал сам по себе, панель поехала отдельно»: в записи между
      // появлением пузыря и стартом панели было 808мс.
      const id = setTimeout(() => {
        // flushSync, а не отложенный вызов: пузырь должен ОКАЗАТЬСЯ В DOM
        // прежде, чем панель начнёт уезжать, иначе он появляется уже под ней,
        // у самого низа экрана. Обычный setState тут не годится — React
        // откладывает коммит, и закрытие успевает пройти первым (проверено:
        // и в одном тике, и через requestAnimationFrame порядок был
        // «setShow(false) → slide-in», то есть наоборот).
        flushSync(() => {
          if (phrase.trim()) onAnswerToChat?.(phrase, 'correct')
          if (tData.responseCorrect?.trim()) onAnswered?.(tData.responseCorrect, 'correct')
        })
        // Пузырь не просто появляется — он ВЪЕЗЖАЕТ снизу (PlayerFeed играет
        // ему slide-in из-под нижнего края экрана). Если панель тронуть сразу,
        // на один и тот же пузырь ложатся два встречных движения: он выезжает
        // снизу и тут же уходит вниз вместе с лентой, которая занимает место
        // панели. Ждём, пока въезд закончится, и только потом отпускаем всё
        // остальное — тогда ответ успевает встать над таблицей.
        whenBubbleLanded(() => closePanelWith('table_correct'))
      }, 600)
      timers.current.push(id)
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
      // Всё, что уходит в переписку, отправляется ВМЕСТЕ с началом закрытия
      // панели — та же задержка, что и на верном ответе. Раньше пузыри летели
      // в чат сразу, а панель трогалась только по её истечении, и движения
      // читались как два независимых.
      const id = setTimeout(() => {
        // flushSync — чтобы пузыри встали НАД панелью, см. верную ветку
        flushSync(() => {
          // Именно последняя попытка — её ученик и видит в переписке
          if (phrase.trim()) onAnswerToChat?.(phrase, 'wrong_final')
          // Правильный ответ — раскрытие подсказкой учителя (не «от лица
          // ученика»: это была ошибка — answer сюда попадал с тем же
          // 'wrong_final', то есть красным и СПРАВА, как будто ученик сам
          // ответил верно, хотя как раз нет)
          if (answer.trim()) onAnswered?.(answer, 'hint')
        })
        // Ждём конца въезда пузырей — та же причина, что и в верной ветке:
        // иначе пузырь на полпути разворачивается и уезжает вниз вместе с
        // лентой (замер: въехал до 479, потом ушёл на 619)
        whenBubbleLanded(() => closePanelWith('table_wrong', variantId))
      }, 600)
      timers.current.push(id)
      return
    }
    const id = setTimeout(() => setResult(null), 700)
    timers.current.push(id)
  }
}
