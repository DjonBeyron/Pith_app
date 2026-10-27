import { resultTitle } from './sayAloudRound.js'

// Итог раунда «Скажи вслух»: «Пит нашёл N слов» текстом и список слов с отметкой. Ни памяти, ни XP раунд пока не трогает (это следующая часть этапа E) — только показ.
export default function SayAloudResult({ result, onClose }) {
  const { hits, words, items } = result
  return (
    <div className="sayCenter" data-testid="say-result">
      <p className="sayTitle">{resultTitle(hits)}</p>
      <p className="saySub">{words === 0 ? 'Раунд закончился раньше, чем дошло до слов' : hits === words ? 'Все слова из раунда на месте' : `Из ${words} — остальные потренируем в другой раз`}</p>
      {items.length > 0 && (
        <ul className="sayList">
          {items.map(a => (
            <li key={a.word} className={a.ok ? 'sayItem sayItem--ok' : 'sayItem sayItem--miss'}>
              <b>{a.ok ? '✓' : '✗'} {a.word}</b>
              <span>{a.translation}</span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="sayBtn" onClick={onClose} data-testid="say-done">Готово</button>
    </div>
  )
}
