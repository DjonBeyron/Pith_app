import { ChevronDown } from 'lucide-react'

// Строка под названием модуля в ленте. По тапу подпись «перевести» уходит в
// блюр, и на её же месте из блюра проступает перевод фразы
// (`curricula.title_translation`) — вниз ничего не разворачивается, оба
// текста лежат в одной ячейке грида (см. .feedTrSwap). Треугольник стоит
// слева в обоих состояниях и только переворачивается. Раньше здесь была
// подпись «X уроков в модуле» — она переехала в кнопку «Изучить фразу»
// (см. FeedSlide).
export default function PhraseTranslationRow({ text, open, onToggle }) {
  return (
    <button
      className="feedTrToggle"
      aria-label={open ? 'скрыть перевод' : 'перевести'}
      onClick={e => { e.stopPropagation(); onToggle() }}>
      <ChevronDown className={open ? 'feedTrChev feedTrChevOpen' : 'feedTrChev'} />
      <span className="feedTrSwap">
        <span className={open ? 'feedTrLabel feedTrLabelOff' : 'feedTrLabel'}>
          перевести
        </span>
        <span className={open ? 'feedTrValue feedTrValueOn' : 'feedTrValue'}>
          {text}
        </span>
      </span>
    </button>
  )
}
