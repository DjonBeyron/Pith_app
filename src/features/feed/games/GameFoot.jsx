import { gameVerdict } from './gameVerdict.js'

// Низ шторки игры после ответа: короткая подпись итога и «Дальше» (стили — feed-choose.css, те же, что у «Выбери слово»).
// Ответа ещё нет — ничего не рисует. result — { ok } | null; answer — верное слово для подписи; onClose — «Дальше»
export default function GameFoot({ result, answer, onClose }) {
  const verdict = gameVerdict(result, answer)
  if (!verdict) return null
  return (
    <div className="chooseFoot">
      <p className={`chooseVerdict chooseVerdict--${verdict.kind}`} role="status">{verdict.text}</p>
      <button type="button" className="chooseNext" onClick={onClose}>Дальше</button>
    </div>
  )
}
