import { useState } from 'react'
import { parseMarkup, toMarkup } from '../../../shared/lib/lessonMarkup.js'
import CopyIcon from './CopyIcon.jsx'
import TableEditor from './TableEditor.jsx'

// Поля текста по типам ноды: [ключ в data, подпись]
const TEXT_KEYS = { text: [['content', 'Текст']], system: [['content', 'Текст']], pin_message: [['content', 'Текст']], audio: [['text', 'Расшифровка голосового']], photo: [['caption', 'Подпись']], sticker: [['caption', 'Подпись']], circle: [['caption', 'Подпись']], video: [['caption', 'Подпись']] }
const PROMPT_TYPES = new Set(['photo', 'sticker', 'photo_choice'])

// Текст с разметкой {g:..}: правится как строка, при вводе разбирается обратно в текст + раскраску (highlights)
function MarkupField({ data, field, label, onPatch }) {
  const [val, setVal] = useState(() => toMarkup(data[field] ?? '', data.highlights ?? []))
  const change = v => {
    setVal(v)
    const { text, highlights } = parseMarkup(v)
    onPatch(d => ({ ...d, [field]: text, highlights }))
  }
  return (
    <div className="rvwEdBlock">
      <label className="rvwEdLbl">{label} <CopyIcon text={() => parseMarkup(val).text} /></label>
      <textarea className="rvwEdIn" rows={Math.min(8, Math.max(2, Math.ceil(val.length / 48)))} value={val} onChange={e => change(e.target.value)} />
    </div>
  )
}

const Plain = ({ label, value, rows = 0, onChange }) => (
  <div className="rvwEdBlock">
    <label className="rvwEdLbl">{label} <CopyIcon text={value} /></label>
    {rows ? <textarea className="rvwEdIn" rows={rows} value={value} onChange={e => onChange(e.target.value)} /> : <input className="rvwEdIn" value={value} onChange={e => onChange(e.target.value)} />}
  </div>
)

// Редактор ноды в окне замечания: правит ту же копию нод, что и холст разбора (до «Применить» основной урок не меняется)
export default function NodeEditor({ node, onPatch }) {
  const d = node.data ?? {}
  const set = (k, v) => onPatch(x => ({ ...x, [k]: v }))
  return (
    <div className="rvwEd">
      {(TEXT_KEYS[node.type] ?? []).map(([k, l]) => <MarkupField key={k} data={d} field={k} label={l} onPatch={onPatch} />)}
      {PROMPT_TYPES.has(node.type) && <Plain label="Текст для генерации (imagePrompt)" value={d.imagePrompt ?? ''} rows={3} onChange={v => set('imagePrompt', v)} />}
      {node.type === 'table' && <TableEditor data={d} onPatch={onPatch} />}
      {node.type === 'word_choice' && (d.options ?? []).map((o, i) => (
        <Plain key={o.id ?? i} label={`Вариант ${i + 1}${o.isCorrect ? ' ✓' : ''}`} value={o.text ?? ''} onChange={v => onPatch(x => ({ ...x, options: x.options.map((m, k) => (k === i ? { ...m, text: v } : m)) }))} />
      ))}
      {node.type === 'phrase_assembly' && <Plain label="Слова фразы (через пробел)" value={(d.words ?? []).join(' ')} onChange={v => set('words', v.split(/\s+/).filter(Boolean))} />}
      {node.type === 'type_word' && <Plain label="Слово / фраза для печати" value={d.word ?? ''} onChange={v => set('word', v)} />}
      {node.type === 'say_phrase' && <>
        <Plain label="Фраза" value={d.phrase ?? ''} onChange={v => set('phrase', v)} />
        <Plain label="Перевод" value={d.translation ?? ''} onChange={v => set('translation', v)} />
      </>}
      {node.type === 'reaction' && <Plain label="Эмодзи" value={d.emoji ?? ''} onChange={v => set('emoji', v)} />}
    </div>
  )
}
