// Напечатанное слово в строке ответа. Если у ошибки есть сигнал автора (см. useTypeWord.js),
// неверная буква мигает (.signalBlinkChip, тот же стиль, что у чипа «Собери фразу») — пока
// ученик не сотрёт её. blinkIndex — позиция буквы без пробелов (слот сигнала); без мигания
// слово рисуется одним куском. Текст внутри data-testid="tw-typed" всегда ровно то, что напечатано.
// caret — мигающий курсор конца набранного. Он лежит В .twLine вне потока (position: absolute, как .catchCaret в «Ловле
// слов»), поэтому ни ширины, ни высоты в раскладке не занимает: строка по центру не сдвигается ни когда курсор появляется,
// ни когда исчезает (после «Проверить» / на замке). key={typed.length} перемонтирует его на каждый ввод/стирание — цикл
// мигания начинается со сплошной фазы (виден, пока печатают). Пока пусто — ZWSP держит высоту строки, курсор в её начале.
const ZWSP = '​'

function Letters({ typed, blinkIndex }) {
  if (blinkIndex == null) return <span className="twTyped" data-testid="tw-typed">{typed}</span>
  let letter = -1
  return (
    <span className="twTyped" data-testid="tw-typed">
      {[...typed].map((ch, i) => {
        if (ch !== ' ') letter += 1
        return ch !== ' ' && letter === blinkIndex
          ? <span key={i} className="signalBlinkChip" data-testid="tw-blink">{ch}</span>
          : ch
      })}
    </span>
  )
}

export default function TypeWordTyped({ typed, blinkIndex = null, caret = false }) {
  if (typed === '' && !caret) return null
  return (
    <span className="twLine">
      {typed === ''
        ? <span className="twTyped twTypedEmpty" aria-hidden="true">{ZWSP}</span>
        : <Letters typed={typed} blinkIndex={blinkIndex} />}
      {caret && <i key={typed.length} className="twCaret" aria-hidden="true" />}
    </span>
  )
}
