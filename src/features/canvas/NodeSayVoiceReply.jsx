import InfoPopup from '../../shared/ui/InfoPopup.jsx'

// Переключатель режима ответа ученика в ноде «Сказать фразу»: выкл = «Текст» (как раньше), вкл = «Голосовое с текстом» (поле voiceReply: true).
// Метка короткая, всё объяснение — в попапе «i» (InfoPopup). Нет поля voiceReply = выключено, старые уроки не меняются.
const stop = e => e.stopPropagation()

export default function NodeSayVoiceReply({ voiceReply = false, onChange }) {
  return (
    <div className="nodeSayCheckRow" onClick={stop}>
      <label className="nodeSayCheck">
        <input type="checkbox" checked={voiceReply} onChange={e => onChange({ voiceReply: e.target.checked })} />
        Голосовое с текстом
      </label>
      <InfoPopup title="Голосовое с текстом" testId="say-info-voice">
        <p>Выключено — реплика ученика в чате приходит только текстом. Включено — справа появится его текст и рядом голосовое сообщение, которое можно прослушать.</p>
        <p>Звук хранится только на телефоне ученика до конца урока и нигде не сохраняется. Приложение прямо говорит об этом в окне перед записью.</p>
        <p>Голосовое доступно, когда речь распознаёт Vosk. Если Vosk не готов, у ученика Firefox или включено системное распознавание — придёт только текст.</p>
        <p>При «Продолжить урок» голосовые не восстанавливаются — остаётся текст. Голосовые приходят и у верных, и у неверных попыток.</p>
      </InfoPopup>
    </div>
  )
}
