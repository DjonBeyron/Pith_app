import { splitTitleTokens } from '../../../shared/lib/titleWords.js'
import { LEVEL_CLASS } from './feedCatch.js'

// Фраза слайда в режиме «Ловли слов» — замена PhraseWords, пока задание идёт: каждое слово накрыто своей
// CSS-маской с узором шариков (.fwMaskPattern.bubblePattern, feed-catch.css), знаки препинания — без маски.
// Тап по замаскированному слову → onPick(index) (панель набора). Набранное слово: маска спадает
// (opacity 320ms — <i> остаётся в DOM с opacity 0, иначе переходу нечего играть), слово красится цветом
// уровня памяти (LEVEL_CLASS; уровень 0 — белое). Текущее слово — .fwCatching (мягкий ореол).
// words — catchWords(title, knowledge): [{ index, text, key, level }]
export default function CatchMaskedWords({ title, words, typedIndexes, currentIndex = -1, onPick }) {
  const tokens = splitTitleTokens(title)
  const levelOf = index => words.find(w => w.index === index)?.level ?? 0
  return (
    <>
      {tokens.map((t, i) => {
        if (!t.word) return <span key={i}>{t.text}</span>
        const typed = typedIndexes.has(t.index)
        const cls = typed
          ? `fwWord ${LEVEL_CLASS(levelOf(t.index))}`.trim()
          : `fwWord fwMasked${t.index === currentIndex ? ' fwCatching' : ''}`
        return (
          <span
            key={i}
            className={cls}
            onClick={typed ? undefined : e => { e.stopPropagation(); onPick(t.index) }}
          >
            {t.text}
            <i className="fwMaskPattern bubblePattern" aria-hidden="true" />
          </span>
        )
      })}
    </>
  )
}
