import { Mic } from 'lucide-react'
import TimelineLine from './TimelineLine.jsx'
import { MAX_LINES } from './timelineOps.js'
import { sceneVoiceStats } from '../../scene/v2/sceneVoice.js'
import ScTip from './ScTip.jsx'

// Таймлайн реплик в сборщике: шапка озвучки («озвучено X из N», «Озвучить всё» — диалог
// useSceneVoice.openAll), список TimelineLine + «Добавить реплику». Перемещение
// вверх/вниз, удаление, дублирование — кнопками в строке (timelineOps.js).
export default function TimelineEditor({ scene, actions, voice = null }) {
  const tl = scene.timeline
  const names = { a: scene.characters.a.name, b: scene.characters.b.name }
  const st = sceneVoiceStats(scene)
  const remaining = voice?.quota ? Math.max(0, voice.quota.limit - voice.quota.used) : null
  return (
    <div className="scbTimeline">
      <p className="scbSub">
        Кто говорит, эмоция <ScTip help="emotion" />, поза <ScTip help="pose" />, текст до 140 символов <ScTip help="text_len" />,
        перевод <ScTip help="translation" />, озвучка <ScTip help="audio_status" />.
      </p>
      {voice && (
        <div className="scbVoiceHead" id="f-timeline-voice">
          <span className="scbVoiceStat">
            Озвучено <b>{st.ready}</b> из {st.total}
            {st.stale > 0 && <span className="scWarnTxt"> · устарело {st.stale}</span>}
            {remaining != null && <span className="scbSub"> · квота ElevenLabs: {remaining.toLocaleString('ru-RU')} симв.</span>}
            {' '}<ScTip help="voice_all" />
          </span>
          <button type="button" className="fsBtn fsBtnSmall" onClick={voice.openAll} disabled={voice.busy || st.ready === st.total} title="Озвучить реплики без актуального файла, по одной">
            <Mic size={13} /> Озвучить всё
          </button>
        </div>
      )}
      <ol className="scbLines">
        {tl.map((line, i) => (
          <TimelineLine
            key={i} index={i} line={line} names={names} total={tl.length} actions={actions} characters={scene.characters} voice={voice}
          />
        ))}
      </ol>
      <button type="button" className="fsBtn" onClick={() => actions.addLine()} disabled={tl.length >= MAX_LINES || !!voice?.busy}>
        + Добавить реплику {tl.length >= MAX_LINES && `(максимум ${MAX_LINES})`}
      </button>
    </div>
  )
}
