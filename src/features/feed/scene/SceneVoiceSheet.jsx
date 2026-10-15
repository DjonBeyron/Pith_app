import { memo } from 'react'
import { Volume2 } from 'lucide-react'
import SayCantIcon from '../../player/panels/say-phrase/SayCantIcon.jsx'
import { voiceNote, voiceVerdictView, VOICE_CANT, VOICE_LATER, VOICE_REPLAY } from './sceneVoiceTexts.js'

// Панель ГОЛОСОВОГО задания в ленте (внутри SceneTaskCover; классы шторки «Ловли» + feed-scene-task.css + feed-scene-voice.css).
// Сверху вопрос и «Ещё раз» (целевая реплика играет ещё раз; пока идёт запись — недоступна). 'repeat' показывает текст реплики, которую
// нужно повторить (kind === 'say': только облачко кота на сцене), ниже строка-заметка постоянной высоты (причина неудачи, подсказка,
// попытки; отказ микрофона). Тело — круг-микрофон из «Сказать фразу» (stage: SayStage, собирает SceneVoicePanel) и тихие кнопки
// «Не могу говорить» / «Спроси позже» (гаснут на время записи). Финал (phase 'checked'): тело складывается, раскрывается вердикт —
// «✓ Отлично!» и что услышали, либо «✗ Не совсем» / «✗ Не расслышал» с ожидаемыми фразами, и «Готово». Попап разрешения (popup) лежит
// на корне шторки — не внутри складывающихся блоков (иначе их overflow его обрежет).
function SceneVoiceSheet({
  kind = 'say', phase, wrong = false, note = null, attempt = 0, ok = false, heard = '', fallbackReason = null,
  prompt, lineText = '', hint = '', expected = [], stage = null, popup = null,
  onReplay, onSkip, onLater, onFinish,
}) {
  const done = phase === 'checked'
  const listening = phase === 'listening'
  const text = voiceNote({ phase, wrong, note, attempt, hint, fallbackReason })
  const v = voiceVerdictView({ ok, heard, expected })
  return (
    <div className="catchSheet stSheet stVoice" role="group" aria-label={prompt} data-kind={kind} data-phase={phase} data-no-unlock="">
      <div className="stHead">
        <div className="stPrompt">{prompt}</div>
        <button type="button" className="stReplay" onClick={onReplay} disabled={listening} aria-label="Послушать реплику ещё раз">
          <Volume2 size={16} strokeWidth={2} /> {VOICE_REPLAY}
        </button>
      </div>
      {kind === 'repeat' && lineText && <p className="stVoiceLine" data-testid="voice-line">{lineText}</p>}
      {!done && <p className={`stNote stVoiceNote${text && !fallbackReason ? ' stNoteBad' : ''}${fallbackReason ? ' stNoteOff' : ''}`} role="status">{text}</p>}
      <div className={done ? 'catchSheetFold' : 'catchSheetFold catchSheetFoldOpen'} inert={done || undefined}>
        <div className="catchSheetFoldIn">
          <div className="catchSheetInner stInner">
            <div className="sayPanel stVoiceMic">
              <div className="sayInner">
                <div className="sayBody stVoiceBody">{stage}</div>
              </div>
            </div>
            <div className={`catchTextBtns stVoiceBtns${listening ? ' stVoiceBtnsHidden' : ''}`}>
              <button type="button" className="catchTextBtn stCantBtn" onClick={onSkip} tabIndex={listening ? -1 : undefined} data-testid="voice-cant">
                <SayCantIcon size={16} strokeWidth={2.1} />{VOICE_CANT}
              </button>
              <button type="button" className="catchTextBtn" onClick={onLater} tabIndex={listening ? -1 : undefined}>{VOICE_LATER}</button>
            </div>
          </div>
        </div>
      </div>
      <div className={done ? 'catchSheetFold catchSheetFoldOpen catchDoneFold' : 'catchSheetFold catchDoneFold'} inert={!done || undefined}>
        <div className="catchSheetFoldIn">
          <div className="stVerdict" data-testid="voice-verdict">
            <p className={v.ok ? 'stVerdictTitle stVerdictOk' : 'stVerdictTitle stVerdictBad'}>{v.title}</p>
            {v.mine && <p className={v.ok ? 'stVerdictHeard' : 'stVerdictMine'}>{v.ok ? 'Ты сказал' : 'Твой ответ'}: «{v.mine}»</p>}
            {v.expected.length > 0 && (
              <div className="stVerdictExpected" data-testid="voice-expected">
                <p className="stVerdictLine">Можно было сказать:</p>
                {v.expected.map(e => <p key={e} className="stVerdictAnswer">{e}</p>)}
              </div>
            )}
            <div className="catchDoneRow stDoneRow">
              <button type="button" className="phraseCheckBtn catchMainBtn" onClick={onFinish}>Готово</button>
            </div>
          </div>
        </div>
      </div>
      {popup}
    </div>
  )
}

export default memo(SceneVoiceSheet)
