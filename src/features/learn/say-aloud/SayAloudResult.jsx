import { resultTitle } from './sayAloudRound.js'

// Итог раунда «Скажи вслух»: «Я услышал N слов» текстом и список слов с отметкой. Промахи ушли в память (слово завтра), xp — награда с сервера (sayAloudApi): строка «+N XP» только если N > 0, цель XP не объявляется.
export default function SayAloudResult({ result, xp = 0, onClose }) {
  const { hits, words, items } = result
  return (
    <div className="sayCenter" data-testid="say-result">
      <p className="sayTitle">{resultTitle(hits)}</p>
      <p className="saySub">{words === 0 ? 'Раунд закончился раньше, чем дошло до слов' : hits === words ? 'Все слова из раунда на месте' : `Из ${words} — остальные потренируем в другой раз`}</p>
      {xp > 0 && <p className="sayXp" data-testid="say-xp">+{xp} XP</p>}
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
