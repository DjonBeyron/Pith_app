// Напечатанное слово в строке ответа. Если у ошибки есть сигнал автора (см. useTypeWord.js),
// неверная буква мигает (.signalBlinkChip, тот же стиль, что у чипа «Собери фразу») — пока
// ученик не сотрёт её. blinkIndex — позиция буквы без пробелов (слот сигнала); без мигания
// слово рисуется одним куском. Текст внутри всегда ровно то, что напечатано.
export default function TypeWordTyped({ typed, blinkIndex = null }) {
  if (typed === '') return null
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
