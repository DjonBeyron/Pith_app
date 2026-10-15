import { useState } from 'react'
import TimelineLine from './TimelineLine.jsx'
import { MAX_LINES, MIN_LINES } from './timelineOps.js'
import { sceneVoiceStats } from '../../scene/v2/sceneVoice.js'
import { speakerVars } from './ui/colorContrast.js'
import ScTip from './ScTip.jsx'

// Таймлайн реплик в сборщике: сводка озвучки («озвучено X из N», квота) и маленькая ссылка
// «Озвучить всё» — та же функция useSceneVoice.openAll, что и кнопка в тулбаре (BuilderToolbar), без
// дублирования логики; по-реплично озвучка — LineVoiceControls. Список TimelineLine (каждая — вложенная панель timeline.<i>) +
// «Добавить реплику». Цвета говорящих (--spk-a/--spk-b из палитр котов, colorContrast.js)
// ставятся один раз на список — меняются сразу при смене палитры персонажа.
export default function TimelineEditor({ scene, actions, voice = null }) {
  const [askAll, setAskAll] = useState(false) // подтверждение «Удалить все реплики» — в строке, не confirm()
  const tl = scene.timeline
  const names = { a: scene.characters.a.name, b: scene.characters.b.name }
  const st = sceneVoiceStats(scene)
  const remaining = voice?.quota ? Math.max(0, voice.quota.limit - voice.quota.used) : null
  return (
    <div className="scbTimeline" style={speakerVars(scene.characters)}>
      <p className="scbSub">
        Кто говорит, эмоция <ScTip help="emotion" />, поза <ScTip help="pose" />, текст до 140 символов <ScTip help="text_len" />,
        перевод <ScTip help="translation" />, озвучка <ScTip help="audio_status" />.
      </p>
      {voice && (
        <div className="scbVoiceHead" id="f-timeline-voice">
          <span className="scbVoiceStat">
            Озвучено <b>{st.ready}</b> из {st.total}
            {st.translation.withText > 0 && <> · перевод <b>{st.translation.ready}</b> из {st.translation.withText}</>}
            {st.stale + st.translation.stale > 0 && <span className="scWarnTxt"> · устарело {st.stale + st.translation.stale}</span>}
            {remaining != null && <span className="scbSub"> · квота ElevenLabs: {remaining.toLocaleString('ru-RU')} симв.</span>}
            {' '}<ScTip help="voice_all" />
          </span>
          <button type="button" className="scbLink" onClick={() => voice.openAll()} disabled={voice.busy || (st.ready === st.total && st.translation.ready === st.translation.withText)} title="Озвучить реплики без актуального файла, по одной (то же, что «Озвучить всё» в верхней панели)">
            Озвучить всё
          </button>
        </div>
      )}
      <div className="scbLinesHead">
        <span className="scbSub">Реплик: <b>{tl.length}</b>{tl.length < MIN_LINES && <span className="scWarnTxt"> · нужно минимум {MIN_LINES}: пока их меньше, сцену нельзя ни применить, ни проверить в ленте</span>}</span>
        {askAll ? (
          <span className="scbAsk" role="alert">
            Удалить все {tl.length}? Вернуть можно только вручную.
            <button type="button" className="fsBtn fsBtnSmall" onClick={() => { setAskAll(false); actions.clearTimeline() }}>Да, удалить все</button>
            <button type="button" className="fsBtn fsBtnSmall" onClick={() => setAskAll(false)}>Отмена</button>
          </span>
        ) : (
          <button type="button" className="scbLink scbLinkDanger" onClick={() => setAskAll(true)} disabled={!tl.length || !!voice?.busy} title="Очистить таймлайн целиком, чтобы собрать реплики заново">
            Удалить все реплики
          </button>
        )}
      </div>
      {!tl.length && <p className="scbSub scbLinesEmpty" role="status">Реплик нет. Нажмите «+ Добавить реплику» — две первые уже сделают сцену годной.</p>}
      <ol className="scbLines">
        {tl.map((line, i) => (
          <TimelineLine
            key={i} index={i} line={line} names={names} total={tl.length} actions={actions} characters={scene.characters} voice={voice} scene={scene}
          />
        ))}
      </ol>
      <button type="button" className="fsBtn" onClick={() => actions.addLine()} disabled={tl.length >= MAX_LINES || !!voice?.busy}>
        + Добавить реплику {tl.length >= MAX_LINES && `(максимум ${MAX_LINES})`}
      </button>
    </div>
  )
}
