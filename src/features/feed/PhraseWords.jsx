import { splitTitleTokens, wordTranslation } from '../../shared/lib/titleWords.js'

// Название модуля в ленте, разбитое на слова: слово, у которого есть перевод,
// кликабельно (тап → линия с переводом, см. WordTranslateLine). Знаки
// препинания и пробелы отрисовываются как есть, но кликать по ним нечего.
// enabled — фраза уже открыта (шарики-спойлер разлетелись): до этого тап по
// тексту должен только открывать фразу, а не показывать перевод. Обёртки
// .fwWord при этом стоят на месте с самого начала (меняется только
// обработчик) — иначе их отступы меняли бы ширину фразы в момент раскрытия,
// а ResizeObserver спойлера принимал бы это за ресайз и обрывал вспышку.
export default function PhraseWords({ title, entries, activeIndex, enabled, onPick }) {
  const tokens = splitTitleTokens(title)
  return (
    <>
      {tokens.map((t, i) => {
        const tr = t.word ? wordTranslation(entries, t.text, t.index) : ''
        if (!t.word || !tr) return <span key={i}>{t.text}</span>
        return (
          <span
            key={i}
            className={t.index === activeIndex ? 'fwWord fwWordOn' : 'fwWord'}
            onClick={enabled
              ? e => { e.stopPropagation(); onPick(t.index, tr, e.currentTarget) }
              : undefined}
          >
            {t.text}
          </span>
        )
      })}
    </>
  )
}
