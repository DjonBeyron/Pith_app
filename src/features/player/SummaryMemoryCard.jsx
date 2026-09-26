// Итог урока-слова, пройденного впервые: «Новое слово во временной памяти»
// (утверждённый макет «Моей памяти», экран «Конец урока»). По «Закрыть» итога
// плашка слова улетает к вкладке «Память» (memoryFresh.js) — ref на плашку
export default function SummaryMemoryCard({ word, pillRef }) {
  return (
    <div className="summaryMemCard">
      <span className="summaryMemLabel">Новое слово во временной памяти</span>
      <span className="summaryMemWord" ref={pillRef}>{word}</span>
      <p className="summaryMemText">
        Мы напомним повторить его в нужный момент — так оно станет родным и уйдёт в постоянную память.
      </p>
    </div>
  )
}
