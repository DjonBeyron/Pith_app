import SayStage from '../../player/panels/say-phrase/SayStage.jsx'
import SayActions from '../../player/panels/say-phrase/SayActions.jsx'
import { micLabel } from '../../../shared/lib/speech/sayMic.js'

const NOOP = () => {}

// Панель «Сказать фразу» в режиме разбора: НАСТОЯЩИЕ части панели ученика (круг-микрофон с кольцом и надписью «Нажмите, чтобы говорить»,
// «Послушать» и «Я не могу говорить»), в состоянии «доступ выдан, ждёт тапа», без касаний — ничего не слушает и не играет (ссылки погашены, круг disabled).
// Под кругом — эталон или шаблон, чтобы автор видел, что именно просит нода. Положение .phrasePanel (fixed внизу экрана) тут не нужно: корень — .rvwSayPrev (lesson-review.css).
export default function SayPanelPreview({ data = {}, line = '' }) {
  const mic = micLabel({ phase: 'idle' })
  return (
    <div className="rvwSayPrev sayPanel" data-testid="rvw-say-preview">
      <div className="phraseInner sayInner">
        <div className="sayBody">
          <SayStage label={mic.label} mode={mic.mode} state="ready" level={null} disabled onTap={NOOP} />
          <SayActions canListen={data.listenAudio !== false && !data.pattern} listenBusy={false} closing canEnable={false} hideSkip={false} onListen={NOOP} onSkip={NOOP} onEnable={NOOP} />
        </div>
      </div>
      {line ? <div className="rvwTypeLine rvwSayLine">{line}</div> : null}
    </div>
  )
}
