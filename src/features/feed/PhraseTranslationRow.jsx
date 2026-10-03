import { ChevronDown } from 'lucide-react'

// Строка под названием модуля в ленте (useTranslationReveal.js). Перевод открывается трением по фразе; дальше
// стрелка прячет его, а подпись «перевести» остаётся (тап открывает снова), пока человек на этом слайде.
// open — показан перевод, иначе — подпись «перевести». peek — строка ещё спрятана, но под палец уже подготовлен
// перевод (он проступает по мере трения, см. --rub в feed-bubble-spoiler.css). Подпись и перевод лежат в одной
// ячейке грида (см. .feedTrSwap), по тапу меняются кросс-фейдом — вниз ничего не разворачивается. Треугольник стоит
// слева в обоих состояниях и только переворачивается. Раньше здесь была подпись «X уроков в модуле» — она переехала
// в кнопку «Изучить фразу» (см. FeedSlide).
export default function PhraseTranslationRow({ text, open, peek = false, onToggle }) {
  const shown = open || peek
  return (
    <button
      className="feedTrToggle"
      tabIndex={peek ? -1 : undefined}
      aria-label={open ? 'скрыть перевод' : 'перевести'}
      onClick={e => { e.stopPropagation(); onToggle() }}>
      <ChevronDown className={shown ? 'feedTrChev feedTrChevOpen' : 'feedTrChev'} />
      <span className="feedTrSwap">
        <span className={shown ? 'feedTrLabel feedTrLabelOff' : 'feedTrLabel'}>
          перевести
        </span>
        <span className={shown ? 'feedTrValue feedTrValueOn' : 'feedTrValue'}>
          {text}
        </span>
      </span>
    </button>
  )
}
