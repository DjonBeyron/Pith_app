import { useState, useRef, useEffect } from 'react'
import { toMarkup } from '../../../shared/lib/lessonMarkup.js'
import CopyIcon from './CopyIcon.jsx'
import TableEditor from './TableEditor.jsx'
import { onlyEmoji } from './onlyEmoji.js'
import { NODE_TYPES } from '../nodeTypes.js'
import RichTextField from '../rich-text/RichTextField.jsx'

// Поля текста по типам ноды: [ключ в data, подпись]
const TEXT_KEYS = { text: [['content', 'Текст']], system: [['content', 'Текст']], pin_message: [['content', 'Текст']], audio: [['text', 'Расшифровка голосового']], photo: [['caption', 'Подпись']], sticker: [['caption', 'Подпись']], circle: [['caption', 'Подпись']], video: [['caption', 'Подпись']] }
const PROMPT_TYPES = new Set(['photo', 'sticker', 'photo_choice'])

// «До» (ro): текст с разметкой {g:..}, только чтение. «После»: то же поле, что на холсте (RichTextField) — выделил слово, всплыла панель раскраски;
// покраска и текст идут в копию ноды, а в JSON замечаний видны разметкой {g:..}/{u:..}
function MarkupField({ data, field, label, onPatch, ro }) {
  if (!ro) return <EditableMarkup data={data} field={field} label={label} onPatch={onPatch} />
  const val = toMarkup(data[field] ?? '', data.highlights ?? [])
  return (
    <div className="rvwEdBlock">
      <label className="rvwEdLbl">{label} <CopyIcon text={() => data[field] ?? ''} /></label>
      <textarea className="rvwEdIn" readOnly rows={Math.min(8, Math.max(2, Math.ceil(val.length / 48)))} value={val} />
    </div>
  )
}

// Поле «После»: набор идёт в ЛОКАЛЬНОЕ состояние (сразу, без лагов и без прыжков курсора), а в копию урока разбора уходит с задержкой 300 мс — иначе
// каждая буква перерисовывала бы весь разбор (ленту, линтер, холст). При закрытии окна несброшенное доходит само
function EditableMarkup({ data, field, label, onPatch }) {
  const [local, setLocal] = useState(() => ({ value: data[field] ?? '', highlights: data.highlights ?? [] }))
  const timer = useRef(null)
  const pending = useRef(null)
  const patchRef = useRef(onPatch)
  useEffect(() => { patchRef.current = onPatch })
  const flush = () => {
    clearTimeout(timer.current)
    if (pending.current) { const p = pending.current; pending.current = null; patchRef.current(d => ({ ...d, ...p })) }
  }
  useEffect(() => flush, [])
  const change = patch => {
    setLocal({ value: patch[field] ?? '', highlights: patch.highlights ?? [] })
    pending.current = patch
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 300)
  }
  return (
    <div className="rvwEdBlock">
      <label className="rvwEdLbl">{label} <CopyIcon text={() => local.value} /></label>
      <RichTextField field={field} value={local.value} highlights={local.highlights} growTextarea className="rvwEdRich" onChange={change} />
    </div>
  )
}

const Plain = ({ label, value, rows = 0, onChange, ro }) => (
  <div className="rvwEdBlock">
    <label className="rvwEdLbl">{label} <CopyIcon text={value} /></label>
    {rows ? <textarea className="rvwEdIn" readOnly={ro} rows={rows} value={value} onChange={e => onChange(e.target.value)} /> : <input className="rvwEdIn" readOnly={ro} value={value} onChange={e => onChange(e.target.value)} />}
  </div>
)

// Редактор ноды в окне замечания: правит ту же копию нод, что и холст разбора (до «Применить» основной урок не меняется)
// ro — режим «только чтение» (колонка «До»: оригинал не меняется, но текст можно выделить и скопировать)
export default function NodeEditor({ node, onPatch, onType, ro = false }) {
  const d = node.data ?? {}
  const set = (k, v) => onPatch(x => ({ ...x, [k]: v }))
  return (
    <div className="rvwEd">
      <div className="rvwEdBlock">
        <label className="rvwEdLbl">Вид ноды</label>
        {ro || !onType
          ? <div className="rvwEdIn">{NODE_TYPES.find(t => t.value === node.type)?.label ?? node.type}</div>
          : <select className="rvwEdIn" value={node.type} onChange={e => onType(e.target.value)}>{NODE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>}
      </div>
      {(TEXT_KEYS[node.type] ?? []).map(([k, l]) => <MarkupField key={k} data={d} field={k} label={l} onPatch={onPatch} ro={ro} />)}
      {PROMPT_TYPES.has(node.type) && <Plain ro={ro} label="Текст для генерации (imagePrompt)" value={d.imagePrompt ?? ''} rows={3} onChange={v => set('imagePrompt', v)} />}
      {node.type === 'table' && <TableEditor data={d} onPatch={onPatch} ro={ro} />}
      {node.type === 'word_choice' && (d.options ?? []).map((o, i) => (
        <Plain ro={ro} key={o.id ?? i} label={`Вариант ${i + 1}${o.isCorrect ? ' ✓' : ''}`} value={o.text ?? ''} onChange={v => onPatch(x => ({ ...x, options: x.options.map((m, k) => (k === i ? { ...m, text: v } : m)) }))} />
      ))}
      {node.type === 'phrase_assembly' && <Plain ro={ro} label="Слова фразы (через пробел)" value={(d.words ?? []).join(' ')} onChange={v => set('words', v.split(/\s+/).filter(Boolean))} />}
      {node.type === 'type_word' && <Plain ro={ro} label="Слово / фраза для печати" value={d.word ?? ''} onChange={v => set('word', v)} />}
      {node.type === 'say_phrase' && <>
        <Plain ro={ro} label="Фраза" value={d.phrase ?? ''} onChange={v => set('phrase', v)} />
        <Plain ro={ro} label="Перевод" value={d.translation ?? ''} onChange={v => set('translation', v)} />
      </>}
      {node.type === 'reaction' && <Plain ro={ro} label="Эмодзи (только эмодзи, текст пиши в замечании)" value={d.emoji ?? ''} onChange={v => set('emoji', onlyEmoji(v))} />}
    </div>
  )
}
