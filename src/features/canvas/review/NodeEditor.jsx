import { useState } from 'react'
import { toMarkup } from '../../../shared/lib/lessonMarkup.js'
import CopyIcon from './CopyIcon.jsx'
import EdField from './EdField.jsx'
import { useDebouncedPatch } from './useDebouncedPatch.js'
import TableEditor from './TableEditor.jsx'
import { onlyEmoji } from './onlyEmoji.js'
import { NODE_TYPES } from '../nodeTypes.js'
import RichTextField from '../rich-text/RichTextField.jsx'
import SceneEditor from './SceneEditor.jsx'

// Поля текста по типам ноды: [ключ в data, подпись]
const TEXT_KEYS = { text: [['content', 'Текст']], system: [['content', 'Текст']], pin_message: [['content', 'Текст']], audio: [['text', 'Расшифровка голосового']], photo: [['caption', 'Подпись']], sticker: [['caption', 'Подпись']], circle: [['caption', 'Подпись']], video: [['caption', 'Подпись']] }
const PROMPT_TYPES = new Set(['photo', 'sticker', 'photo_choice'])

// «До» (ro): текст с разметкой {g:..}, только чтение. «После»: то же поле, что на холсте (RichTextField) — выделил слово, всплыла панель раскраски;
// покраска и текст идут в копию ноды, а в JSON замечаний видны разметкой {g:..}/{u:..}
function MarkupField({ data, field, label, onPatch, reg, ro }) {
  if (!ro) return <EditableMarkup data={data} field={field} label={label} onPatch={onPatch} reg={reg} />
  const val = toMarkup(data[field] ?? '', data.highlights ?? [])
  return (
    <div className="rvwEdBlock">
      <label className="rvwEdLbl">{label} <CopyIcon text={() => data[field] ?? ''} /></label>
      <textarea className="rvwEdIn" readOnly rows={Math.min(8, Math.max(2, Math.ceil(val.length / 48)))} value={val} />
    </div>
  )
}

// Поле «После»: набор идёт в ЛОКАЛЬНОЕ состояние (сразу, без лагов и без прыжков курсора), а в копию урока разбора уходит с задержкой 300 мс — иначе
// каждая буква перерисовывала бы весь разбор (ленту, линтер, холст)
function EditableMarkup({ data, field, label, onPatch, reg }) {
  const [local, setLocal] = useState(() => ({ value: data[field] ?? '', highlights: data.highlights ?? [] }))
  const commit = useDebouncedPatch(onPatch, reg, 900) // 900 мс: на большом уроке каждая отправка перерисовывает разбор, при наборе подряд не шлём
  const change = patch => {
    setLocal({ value: patch[field] ?? '', highlights: patch.highlights ?? [] })
    commit(d => ({ ...d, ...patch }))
  }
  return (
    <div className="rvwEdBlock">
      <label className="rvwEdLbl">{label} <CopyIcon text={() => local.value} /></label>
      <RichTextField field={field} value={local.value} highlights={local.highlights} growTextarea className="rvwEdRich" onChange={change} />
    </div>
  )
}

// Редактор ноды в окне замечания: правит ту же копию нод, что и холст разбора (до «Применить» основной урок не меняется)
// ro — режим «только чтение» (колонка «До»: оригинал не меняется, но текст можно выделить и скопировать)
export default function NodeEditor({ node, onPatch, onType, reg, ro = false }) {
  const d = node.data ?? {}
  const set = k => v => x => ({ ...x, [k]: v })
  const f = { ro, reg, onPatch }
  return (
    <div className="rvwEd">
      <div className="rvwEdBlock">
        <label className="rvwEdLbl">Вид ноды</label>
        {ro || !onType
          ? <div className="rvwEdIn">{NODE_TYPES.find(t => t.value === node.type)?.label ?? node.type}</div>
          : <select className="rvwEdIn" value={node.type} onChange={e => onType(e.target.value)}>{NODE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>}
      </div>
      {(TEXT_KEYS[node.type] ?? []).map(([k, l]) => <MarkupField key={k} data={d} field={k} label={l} onPatch={onPatch} reg={reg} ro={ro} />)}
      {PROMPT_TYPES.has(node.type) && <EdField {...f} label="Текст для генерации (imagePrompt)" value={d.imagePrompt ?? ''} rows={3} apply={set('imagePrompt')} />}
      {node.type === 'scene' && <SceneEditor data={d} onPatch={onPatch} reg={reg} ro={ro} />}
      {node.type === 'table' && <TableEditor data={d} onPatch={onPatch} reg={reg} ro={ro} />}
      {node.type === 'word_choice' && (d.options ?? []).map((o, i) => (
        <EdField {...f} key={o.id ?? i} label={`Вариант ${i + 1}${o.isCorrect ? ' ✓' : ''}`} value={o.text ?? ''} apply={v => x => ({ ...x, options: x.options.map((m, k) => (k === i ? { ...m, text: v } : m)) })} />
      ))}
      {node.type === 'phrase_assembly' && <EdField {...f} label="Слова фразы (через пробел)" value={(d.words ?? []).join(' ')} apply={v => set('words')(v.split(/\s+/).filter(Boolean))} />}
      {node.type === 'type_word' && <EdField {...f} label="Слово / фраза для печати" value={d.word ?? ''} apply={set('word')} />}
      {node.type === 'say_phrase' && <>
        <EdField {...f} label="Фраза" value={d.phrase ?? ''} apply={set('phrase')} />
        <EdField {...f} label="Перевод" value={d.translation ?? ''} apply={set('translation')} />
      </>}
      {node.type === 'reaction' && <EdField {...f} label="Эмодзи (только эмодзи, текст пиши в замечании)" value={d.emoji ?? ''} clean={onlyEmoji} apply={set('emoji')} />}
    </div>
  )
}
