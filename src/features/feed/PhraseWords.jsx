import { splitTitleTokens, wordTranslation } from '../../shared/lib/titleWords.js'

// Название модуля в ленте, разбитое на слова: слово, у которого есть перевод,
// кликабельно (тап → линия с переводом, см. WordTranslateLine). Знаки
// препинания и пробелы отрисовываются как есть, но кликать по ним нечего.
// enabled — фраза уже открыта (шарики-спойлер разлетелись): до этого тап по
// тексту должен только открывать фразу, а не показывать перевод. Обёртки
// .fwWord при этом стоят на месте с самого начала (меняется только
// обработчик) — иначе их отступы меняли бы ширину фразы в момент раскрытия,
// а ResizeObserver спойлера принимал бы это за ресайз и обрывал вспышку.
// levelOf(текст слова) — память слов: знакомое слово окрашено цветом своей ступени, как во
// вкладке «Память» (.fwKnown--1|2|3|P, только цвет — ширина фразы не меняется); нет — белое.
// lureIndex — слово со сроком «сегодня»: мягко «дышит» (.fwDue) и по тапу открывает проверку.
// tint — цвет плашки повторения: открытое слово заливается им вместо лайма
export default function PhraseWords({ title, entries, activeIndex, enabled, onPick, levelOf = null, lureIndex = -1, tint = null }) {
  const tokens = splitTitleTokens(title)
  return (
    <>
      {tokens.map((t, i) => {
        const tr = t.word ? wordTranslation(entries, t.text, t.index) : ''
        const level = t.word && levelOf ? levelOf(t.text) : null
        const known = level ? ` fwKnown fwKnown--${level}` : ''
        if (!t.word || !tr) return <span key={i} className={known.trim() || undefined}>{t.text}</span>
        const on = t.index === activeIndex
        const lure = t.index === lureIndex
        return (
          <span
            key={i}
            className={(on ? 'fwWord fwWordOn' : 'fwWord') + known + (lure ? ' fwDue' : '') + (on && tint ? ' fwTint' : '')}
            style={on && tint ? { '--wt-c': tint } : undefined}
            onClick={enabled
              ? e => { e.stopPropagation(); onPick(t.index, tr, e.currentTarget, lure) }
              : undefined}
          >
            {t.text}
          </span>
        )
      })}
    </>
  )
}
