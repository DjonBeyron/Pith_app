import InfoPopup from '../../shared/ui/InfoPopup.jsx'

// Чекбокс «Озвучить верный ответ» для «Выбери слово» (voiceCorrect) и «Собери фразу» (voiceAnswer). checked — уже итоговое
// значение с учётом умолчания (его считает вызывающий код). Для русского верного варианта «Выбери слово» ниже появляется поле
// с английской фразой (voicePhrase): у русского текста озвучки нет, голосом звучит она.
const TEXTS = {
  choice: ['Озвучить верный ответ', 'Верный вариант озвучивается после звука «верно». По умолчанию включено, если верный вариант английский. Для русского варианта укажи английскую фразу — она и прозвучит.'],
  phrase: ['Озвучить собранную фразу', 'После верной сборки фраза целиком озвучивается голосом (после звука «верно»). По умолчанию включено; озвучка берётся из библиотеки слов.'],
}

export default function NodeVoiceCheckbox({ kind = 'choice', checked, onChange, phrase, onPhraseChange }) {
  const [label, info] = TEXTS[kind]
  return (
    <>
      <label className="nodeRewardCheckbox" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="nodeRewardLabel">{label}</span>
        <InfoPopup title={label} testId="voice-correct-info"><p>{info}</p></InfoPopup>
      </label>
      {checked && onPhraseChange && (
        <div className="nodeSayCheckRow" onClick={e => e.stopPropagation()}>
          <span className="nodeTwLabel">Английская фраза для озвучки</span>
          <input
            className="nodeWcInput" value={phrase ?? ''} placeholder="We need to leave"
            aria-label="Английская фраза для озвучки верного ответа"
            onChange={e => onPhraseChange(e.target.value)} onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
