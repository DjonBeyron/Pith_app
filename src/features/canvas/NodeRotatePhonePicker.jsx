import { NO_AUTOCORRECT } from '../../shared/lib/noAutoCorrectProps.js'

// Нода «Переверни телефон» — вертикальная игра «Повтори за диктором»: слово (латиница) и его перевод.
// Голос диктора — из библиотеки озвучки слов (слово попадает в список «нужна озвучка» само, collectLessonWords), а пока записи нет — голосом системы.
// Слово пустое — игра идёт встроенным словом (wordLaneConfig.DEMO_WORD). Текст карточки в чате правится выше, в общем поле content.
export default function NodeRotatePhonePicker({ tData, onDataChange }) {
  return (
    <div className="nodeRotateTrainer" onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      <input
        className="nodeRotateInput"
        value={tData.word ?? ''}
        onChange={e => onDataChange({ word: e.target.value })}
        placeholder="Слово для повтора, например: try"
        {...NO_AUTOCORRECT}
      />
      <input
        className="nodeRotateInput"
        value={tData.translation ?? ''}
        onChange={e => onDataChange({ translation: e.target.value })}
        placeholder="Перевод — ученик получит его в финале"
        {...NO_AUTOCORRECT}
      />
    </div>
  )
}
