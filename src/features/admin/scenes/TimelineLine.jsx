import { useRef } from 'react'
import { ArrowUp, ArrowDown, Copy, Trash2 } from 'lucide-react'
import { EMOTIONS, POSES } from '../../scene/v2/sceneConstants.js'
import { charsLeft, MAX_TEXT } from './timelineOps.js'
import { EMOTION_LABEL, POSE_LABEL } from './sceneLabels.js'
import Panel from './ui/Panel.jsx'
import LineVoiceControls from './voice/LineVoiceControls.jsx'
import SegmentVoiceControls from './voice/SegmentVoiceControls.jsx'
import { hasVarParts } from '../../scene/v2/sceneVarsSegments.js'
import InsertVarSelect from './InsertVarSelect.jsx'

// Одна реплика таймлайна — вложенная панель timeline.<i> (заголовок «3 · Имя — начало
// текста», свёрнутая показывает только его). Кто говорит — кнопки «A · Рыжик / B · Дымка»:
// выбранная ЗАЛИТА цветом персонажа (--spk-a/--spk-b с контрастным текстом, ставит
// TimelineEditor), левая полоса карточки — тем же цветом. Эмоция, поза, текст со счётчиком,
// перевод (≤ 140, счётчик), два блока озвучки — текст и перевод (LineVoiceControls set=original|translation; у реплики со словом пользователя блок текста — SegmentVoiceControls, озвучка по частям);
// кнопки вверх/вниз/дублировать/удалить в шапке панели
// (заблокированы, пока идёт озвучка — индексы плана). id — f-timeline-<i>-<поле>.
// characters — для статуса «устарело» (hash по голосу персонажа) и списка говорящих (без b — одиночная сцена: только A).
const snippet = text => { const t = String(text ?? '').trim(); return t.length > 36 ? `${t.slice(0, 36)}…` : t }

export default function TimelineLine({ index: i, line, names, total, actions, characters = null, voice = null, scene = null }) {
  const p = `f-timeline-${i}`
  const textRef = useRef(null)
  const trRef = useRef(null)
  const left = charsLeft(line.text)
  const trLen = String(line.translation ?? '').trim().length
  const trLeft = MAX_TEXT - trLen
  const lock = !!voice?.busy
  const whos = characters && !characters.b ? ['a'] : ['a', 'b']
  const title = (
    <>
      <i className="scbSpkDot" data-who={line.who} aria-hidden="true">{line.who.toUpperCase()}</i>
      <span className="scbLineN">{i + 1}</span> {names[line.who]}
      <span className="scbCount scbLineSnippet">{snippet(line.text) || 'пустая реплика'}</span>
    </>
  )
  const extra = (
    <div className="scbLineBtns">
      <button type="button" className="scbIcon" onClick={() => actions.moveLine(i, -1)} disabled={lock || i === 0} aria-label="Выше"><ArrowUp size={14} /></button>
      <button type="button" className="scbIcon" onClick={() => actions.moveLine(i, 1)} disabled={lock || i === total - 1} aria-label="Ниже"><ArrowDown size={14} /></button>
      <button type="button" className="scbIcon" onClick={() => actions.duplicateLine(i)} disabled={lock} aria-label="Дублировать"><Copy size={14} /></button>
      <button type="button" className="scbIcon scbIconDanger" onClick={() => actions.removeLine(i)} disabled={lock} aria-label="Удалить реплику" title="Удалить (можно удалить все — черновик без реплик допустим, линтер напомнит про минимум)"><Trash2 size={14} /></button>
    </div>
  )
  return (
    <li className="scbLine" data-who={line.who}>
      <Panel id={`timeline.${i}`} title={title} label={`Реплика ${i + 1} — ${names[line.who]}`} fieldId={p} extra={extra} nested as="h4" className="scbLinePanel">
        <div className="scbLineTop">
          <div className="scbWhoBtns" role="radiogroup" aria-label={`Кто говорит в реплике ${i + 1}`} id={`${p}-who`}>
            {whos.map(w => (
              <button key={w} type="button" role="radio" aria-checked={line.who === w} data-who={w} className={line.who === w ? 'scbWho scbWhoOn' : 'scbWho'} onClick={() => actions.updateLine(i, { who: w })}>
                <i className="scbWhoDot" aria-hidden="true" />{w.toUpperCase()} · {names[w]}
              </button>
            ))}
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
          <textarea ref={textRef} id={`${p}-text`} className="fsNote scbText" rows={2} value={line.text} maxLength={MAX_TEXT} onChange={e => actions.updateLine(i, { text: e.target.value })} placeholder="Реплика по-русски, со знаком в конце." />
        </label>
        <InsertVarSelect scene={scene} index={i} field="text" inputRef={textRef} actions={actions} disabled={lock} />
        <label className="scbField">
          <span className="scbFieldLabel">Перевод / подсказка <span className={trLeft < 0 ? 'scbCounter scbCounterBad' : trLeft < 30 ? 'scbCounter scbCounterWarn' : 'scbCounter'}>{trLen} / {MAX_TEXT}</span></span>
          <input ref={trRef} id={`${p}-translation`} className="fsNote" value={line.translation ?? ''} maxLength={MAX_TEXT} onChange={e => actions.updateLine(i, { translation: e.target.value })} placeholder="необязательно; озвучивается отдельным голосом" />
        </label>
        <InsertVarSelect scene={scene} index={i} field="translation" inputRef={trRef} actions={actions} disabled={lock} />
        <div className="scbVoiceSets">
          {hasVarParts(line.text)
            ? <SegmentVoiceControls index={i} line={line} character={characters?.[line.who]} voice={voice} idPrefix={p} />
            : <LineVoiceControls index={i} line={line} character={characters?.[line.who]} voice={voice} idPrefix={p} set="original" scene={scene} />}
          <LineVoiceControls index={i} line={line} character={characters?.[line.who]} voice={voice} idPrefix={p} set="translation" scene={scene} />
        </div>
      </Panel>
    </li>
  )
}
