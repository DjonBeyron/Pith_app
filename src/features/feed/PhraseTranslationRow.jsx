import { ChevronDown } from 'lucide-react'

// Строка под названием модуля в ленте: «раскрыть перевод ⌄» — по тапу
// разворачивается полный перевод фразы (curricula.title_translation).
// Раньше на этом месте была подпись «X уроков в модуле» — она переехала в
// кнопку «Изучить фразу» (см. FeedSlide).
// Открытый перевод подписи не требует: сам текст перевода на виду, поэтому
// от строки остаётся только треугольник (развёрнутый вверх).
export default function PhraseTranslationRow({ text, open, onToggle }) {
  return (
    <>
      <button
        className="feedTrToggle"
        aria-label={open ? 'скрыть перевод' : 'раскрыть перевод'}
        onClick={e => { e.stopPropagation(); onToggle() }}>
        {!open && 'раскрыть перевод'}
        <ChevronDown className={open ? 'feedTrChev feedTrChevOpen' : 'feedTrChev'} />
      </button>
      <div className={open ? 'feedTrText feedTrTextOpen' : 'feedTrText'}>{text}</div>
    </>
  )
}
