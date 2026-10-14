import { ArrowUp, ArrowDown, Copy, Trash2 } from 'lucide-react'
import { EMOTIONS, POSES } from '../../scene/v2/sceneConstants.js'
import { audioStatus, AUDIO_STATUS_LABEL, charsLeft, MAX_TEXT, MIN_LINES } from './timelineOps.js'
import { EMOTION_LABEL, POSE_LABEL } from './sceneLabels.js'

// Одна реплика таймлайна: кто говорит (A/B с именами), эмоция, поза, текст со счётчиком,
// перевод, статус аудио; кнопки вверх/вниз/дублировать/удалить. id — f-timeline-<i>-<поле>.

export default function TimelineLine({ index: i, line, names, total, actions }) {
  const p = `f-timeline-${i}`
  const left = charsLeft(line.text)
  const audio = audioStatus(line)
  return (
    <li className={`scbLine scbLine-${line.who}`} id={p}>
      <div className="scbLineTop">
        <span className="scbLineN">{i + 1}</span>
        <div className="scSegBtns" role="radiogroup" aria-label={`Кто говорит в реплике ${i + 1}`} id={`${p}-who`}>
          {['a', 'b'].map(w => (
            <button key={w} type="button" role="radio" aria-checked={line.who === w} className={line.who === w ? 'scSegBtn scSegBtnOn' : 'scSegBtn'} onClick={() => actions.updateLine(i, { who: w })}>
              {w.toUpperCase()} · {names[w]}
            </button>
          ))}
        </div>
        <div className="scbLineBtns">
          <button type="button" className="scbIcon" onClick={() => actions.moveLine(i, -1)} disabled={i === 0} aria-label="Выше"><ArrowUp size={14} /></button>
          <button type="button" className="scbIcon" onClick={() => actions.moveLine(i, 1)} disabled={i === total - 1} aria-label="Ниже"><ArrowDown size={14} /></button>
          <button type="button" className="scbIcon" onClick={() => actions.duplicateLine(i)} aria-label="Дублировать"><Copy size={14} /></button>
          <button type="button" className="scbIcon scbIconDanger" onClick={() => actions.removeLine(i)} disabled={total <= MIN_LINES} aria-label="Удалить реплику" title={total <= MIN_LINES ? `Минимум ${MIN_LINES} реплики` : 'Удалить'}><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="scbLineSel">
        <label className="scbField">
          <span className="scbFieldLabel">Эмоция</span>
          <select id={`${p}-emotion`} className="fsNote" value={line.emotion} onChange={e => actions.updateLine(i, { emotion: e.target.value })}>
            {EMOTIONS.map(e => <option key={e} value={e}>{EMOTION_LABEL[e]} ({e})</option>)}
          </select>
        </label>
        <label className="scbField">
          <span className="scbFieldLabel">Поза</span>
          <select id={`${p}-pose`} className="fsNote" value={line.pose ?? 'talk'} onChange={e => actions.updateLine(i, { pose: e.target.value })}>
            {POSES.map(e => <option key={e} value={e}>{POSE_LABEL[e]} ({e})</option>)}
          </select>
        </label>
      </div>
      <label className="scbField">
        <span className="scbFieldLabel">Текст <span className={left < 0 ? 'scbCounter scbCounterBad' : left < 30 ? 'scbCounter scbCounterWarn' : 'scbCounter'}>{String(line.text ?? '').trim().length} / {MAX_TEXT}</span></span>
        <textarea id={`${p}-text`} className="fsNote scbText" rows={2} value={line.text} maxLength={MAX_TEXT} onChange={e => actions.updateLine(i, { text: e.target.value })} placeholder="Реплика по-русски, со знаком в конце." />
      </label>
      <label className="scbField">
        <span className="scbFieldLabel">Перевод / подсказка</span>
        <input id={`${p}-translation`} className="fsNote" value={line.translation ?? ''} onChange={e => actions.updateLine(i, { translation: e.target.value })} placeholder="необязательно" />
      </label>
      <p className="scbAudio" id={`${p}-audioUrl`}>
        Аудио: <span className={`scbAudioTag scbAudio-${audio}`}>{AUDIO_STATUS_LABEL[audio]}</span>
        {audio === 'none' && <span className="scbSub"> — озвучка файлом появится позже; пока синтез речи устройства</span>}
      </p>
    </li>
  )
}
