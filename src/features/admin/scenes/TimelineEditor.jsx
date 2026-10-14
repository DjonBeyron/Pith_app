import TimelineLine from './TimelineLine.jsx'
import { MAX_LINES } from './timelineOps.js'
import ScTip from './ScTip.jsx'

// Таймлайн реплик в сборщике: список TimelineLine + «Добавить реплику». Перемещение
// вверх/вниз, удаление, дублирование — кнопками в строке (timelineOps.js).
export default function TimelineEditor({ scene, actions }) {
  const tl = scene.timeline
  const names = { a: scene.characters.a.name, b: scene.characters.b.name }
  return (
    <div className="scbTimeline">
      <p className="scbSub">
        Кто говорит, эмоция <ScTip help="emotion" />, поза <ScTip help="pose" />, текст до 140 символов <ScTip help="text_len" />,
        перевод <ScTip help="translation" />, статус аудио <ScTip help="audio_status" />.
      </p>
      <ol className="scbLines">
        {tl.map((line, i) => (
          <TimelineLine
            key={i} index={i} line={line} names={names} total={tl.length} actions={actions}
          />
        ))}
      </ol>
      <button type="button" className="fsBtn" onClick={() => actions.addLine()} disabled={tl.length >= MAX_LINES}>
        + Добавить реплику {tl.length >= MAX_LINES && `(максимум ${MAX_LINES})`}
      </button>
    </div>
  )
}
