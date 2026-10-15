import { memo } from 'react'
import { Volume2 } from 'lucide-react'
import SayCantIcon from '../../player/panels/say-phrase/SayCantIcon.jsx'
import { useFrozenPhase } from './useFrozenPhase.js'
import { voiceNote, voiceVerdictView, VOICE_CANT, VOICE_LATER, VOICE_REPLAY } from './sceneVoiceTexts.js'

// Панель ГОЛОСОВОГО задания в ленте (внутри SceneTaskCover; классы шторки «Ловли» + feed-scene-task.css + feed-scene-voice.css).
// Сверху вопрос и «Ещё раз» (целевая реплика играет ещё раз; пока идёт запись — недоступна). 'repeat' показывает текст реплики, которую
// нужно повторить (kind === 'say': только облачко кота на сцене). Ниже «слот» (.stVoiceFlow) ОДНОЙ высоты для всех фаз: строка-заметка
// фиксированной высоты (причина неудачи, подсказка, попытки; отказ микрофона) + тело — круг-микрофон из «Сказать фразу» (stage: SayStage,
// собирает SceneVoicePanel) и тихие кнопки «Не могу говорить» / «Спроси позже» (гаснут на время записи). Финал (phase 'checked'): тело и
// заметка гаснут, поверх них в том же слоте проявляется вердикт — «✓ Отлично!» и что услышали, либо «✗ Не совсем» / «✗ Не расслышал» с
// ожидаемыми фразами, и «Готово» внизу. Вердикт лежит абсолютным слоем: высота панели и фона, круг и кнопки в финале не двигаются
// (итоги не меняют размер модуля микрофона); длинный текст вердикта прокручивается внутри слоя. Фаза 'closed' (панель уезжает) вид не
// меняет (useFrozenPhase). Попап разрешения (popup) лежит на корне шторки — не внутри слота.
function SceneVoiceSheet({
  kind = 'say', phase: rawPhase, wrong = false, note = null, attempt = 0, ok = false, heard = '', fallbackReason = null,
  prompt, lineText = '', hint = '', expected = [], stage = null, popup = null,
  onReplay, onSkip, onLater, onFinish,
}) {
  const phase = useFrozenPhase(rawPhase)
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
      <div className="stVoiceFlow" data-done={done ? '' : undefined}>
        <p className={`stNote stVoiceNote${text && !fallbackReason ? ' stNoteBad' : ''}${fallbackReason ? ' stNoteOff' : ''}`} role="status">{text}</p>
        <div className="catchSheetInner stInner stVoiceMain" inert={done || undefined}>
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
        <div className="stVoicePane" inert={!done || undefined} data-testid="voice-verdict">
          <div className="stVoicePaneText stVerdict">
            <p className={v.ok ? 'stVerdictTitle stVerdictOk' : 'stVerdictTitle stVerdictBad'}>{v.title}</p>
            {v.mine && <p className={v.ok ? 'stVerdictHeard' : 'stVerdictMine'}>{v.ok ? 'Ты сказал' : 'Твой ответ'}: «{v.mine}»</p>}
            {v.expected.length > 0 && (
              <div className="stVerdictExpected" data-testid="voice-expected">
                <p className="stVerdictLine">Можно было сказать:</p>
                {v.expected.map(e => <p key={e} className="stVerdictAnswer">{e}</p>)}
              </div>
            )}
          </div>
          <div className="stVoiceDoneRow">
            <button type="button" className="phraseCheckBtn catchMainBtn" onClick={onFinish}>Готово</button>
          </div>
        </div>
      </div>
      {popup}
    </div>
  )
}

export default memo(SceneVoiceSheet)
