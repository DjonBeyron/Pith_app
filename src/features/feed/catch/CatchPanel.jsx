import { useEffect, useState } from 'react'
import TypeWordKeyboard from '../../player/panels/type-word/TypeWordKeyboard.jsx'
import TypeWordTyped from '../../player/panels/type-word/TypeWordTyped.jsx'

// Панель набора слова «Ловли слов» — внизу слайда ленты (feed-catch.css: появление снизу translateY 260ms).
// Пока есть текущее слово: строка набранного (TypeWordTyped + курсор), клавиатура с запутывателями
// (TypeWordKeyboard, helped — после «Помочь памяти» запутыватели гаснут), кнопки «Помочь памяти» (одна на слово,
// на уровне 0 нет — запутывателей там нет) и «Проверить». Между словами (current == null) вместо клавиатуры —
// «Тапни следующее слово». Ниже всегда — ссылка «Раскрыть фразу» и, пока набраны не все слова, подпись.
// Неверный «Проверить» — красная тряска строки (wrongFlash, те же классы, что в «Напечатай слово»).
export default function CatchPanel({
  current, typed, helped, model, wrongFlash, remaining,
  onKey, onBackspace, onHelp, onCheck, onReveal,
}) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const rowCls = [
    'phraseAnswerRow twAnswerRow catchAnswerRow',
    typed ? 'phraseAnswerFilled' : '',
    wrongFlash ? 'phraseAnswerErr' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={`catchPanel${show ? ' catchPanelVisible' : ''}`} role="group" aria-label="Напечатай слово, которое расслышал">
      <div className="catchPanelInner">
        {current && model ? (
          <>
            <div className={rowCls} aria-live="polite">
              <TypeWordTyped typed={typed} />
              <span className="twCaret" aria-hidden="true" />
            </div>
            <TypeWordKeyboard model={model} helped={helped} onKey={onKey} onBackspace={onBackspace} />
            <div className="catchBtns">
              {current.level > 0 && !helped && (
                <button type="button" className="catchHelpBtn" onClick={onHelp}>Помочь памяти</button>
              )}
              <button type="button" className="phraseCheckBtn catchCheckBtn" disabled={!typed.trim()} onClick={onCheck}>
                Проверить
              </button>
            </div>
          </>
        ) : (
          <div className="catchNext">Тапни следующее слово</div>
        )}
        <button type="button" className="catchRevealBtn" onClick={onReveal}>Раскрыть фразу</button>
        {remaining > 0 && <div className="catchRevealNote">Откроет всю фразу. Ненабранные слова не засчитаются</div>}
      </div>
    </div>
  )
}
