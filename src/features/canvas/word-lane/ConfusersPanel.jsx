import { MAX_CONFUSERS, normalizeConfusers } from '../../player/modules/rotate-phone/wordLaneRecipe.js'
import { missingChunks } from '../../player/modules/rotate-phone/wordLaneLib.js'
import { NO_AUTOCORRECT } from '../../../shared/lib/noAutoCorrectProps.js'

// Слова-запутыватели в ноде «Переверни телефон»: каждый кусок фразы — свернутый блок, в который можно дописать до двух слов, похожих на кусок по звучанию («trying» → «tying», «drying»).
// У куска с запутывателями в игре появляется свой раунд «Различи»: слов на экране нет — диктор называет кусок, потом по очереди идут пилюли, и у каждой звучит её слово (верное или запутыватель);
// ученик тапает дорожку, где прозвучало искомое. Пустые блоки раунда не дают. Запутыватели ОЗВУЧИВАЮТСЯ из библиотеки озвучки слов (как куски фразы; нет озвучки — голос системы): их надо озвучить. Поле typeData.rotate_phone.confusers — массив (по куску) массивов строк.
export default function ConfusersPanel({ chunks, value, onChange }) {
  if (!chunks.length) return null
  const clean = normalizeConfusers(value, chunks)
  const setWord = (i, j, text) => {
    const next = chunks.map((_, k) => Array.from({ length: MAX_CONFUSERS }, (__, m) => (k === i && m === j ? text : (Array.isArray(value?.[k]) ? value[k][m] : '') ?? '')))
    onChange(next)
  }
  const rounds = chunks.filter((_, i) => clean[i].length)
  const noVoice = missingChunks(clean.flat())
  return (
    <div className="nodeConfusers" data-testid="confusers">
      <div className="nodeRotateTrainerInfo nodeConfusersHead">Слова-запутыватели → раунд «Различи»{rounds.length ? ` (кусков с раундом: ${rounds.length})` : ' — допишите слова в блок куска'}</div>
      {noVoice.length > 0 && <div className="nodeRotateTrainerInfo nodeConfusersHead">Нет озвучки в библиотеке слов: {noVoice.map(w => `«${w}»`).join(', ')} — озвучьте (пока их проговорит голос системы)</div>}
      {chunks.map((chunk, i) => (
        <details key={i} className="nodeConfusersItem">
          <summary>«{chunk}»{clean[i].length ? ` — ✓ ${clean[i].join(', ')}` : ''}</summary>
          <div className="nodeConfusersBody">
            {Array.from({ length: MAX_CONFUSERS }, (_, j) => (
              <input key={j} className="nodeRotateInput" value={(Array.isArray(value?.[i]) ? value[i][j] : '') ?? ''} onChange={e => setWord(i, j, e.target.value)}
                placeholder={`Похожее на «${chunk}» слово ${j + 1}${j ? ' (необязательно)' : ''}`} maxLength={40} aria-label={`Запутыватель ${j + 1} для «${chunk}»`} {...NO_AUTOCORRECT} />
            ))}
          </div>
        </details>
      ))}
    </div>
  )
}
