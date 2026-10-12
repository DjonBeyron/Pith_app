import { useState } from 'react'
import RichTextField from '../rich-text/RichTextField.jsx'
import ChatBubblePreview from '../ChatBubblePreview.jsx'
import { EXAMPLE_TYPES, parseExample, serializeExample, newBubble } from './ruleExample.js'

const LABEL = Object.fromEntries(EXAMPLE_TYPES)

// Предпросмотр последовательности «как придёт в чат»: тот же пузырь, что в плеере и в окнах ноды (ChatBubblePreview)
function Preview({ bubbles }) {
  const shown = bubbles.filter(b => b.content.trim())
  if (!shown.length) return null
  return (
    <div className="rwChat">
      {shown.map((b, i) => (
        <div key={i} className={`rwPv rwPv--${b.type}`}>
          {b.type !== 'text' && b.type !== 'reaction' && <span className="rwPvTag">{LABEL[b.type]}</span>}
          {b.type === 'reaction'
            ? <span className="rwPvEmoji">{b.content}</span>
            : <ChatBubblePreview text={b.content} highlights={b.highlights} hardWrap={b.hardWrap} />}
        </div>
      ))}
    </div>
  )
}

// Редактор примера «нельзя / можно»: цепочка нод; текст правится ТЕМ ЖЕ полем с раскраской, что и в нодах урока (выдели слово — всплывёт панель).
// В базе хранится JSON; для ИИ пример превращается в строки «тип: текст с метками {g:..}» (ruleExample.js → exampleToPrompt)
export default function RuleExample({ tone, title, value, onChange, disabled }) {
  const [bubbles, setBubbles] = useState(() => parseExample(value))
  const commit = next => { setBubbles(next); onChange(serializeExample(next)) }
  const patch = (i, p) => commit(bubbles.map((b, k) => (k === i ? { ...b, ...p } : b)))

  return (
    <div className={`rwEx rwEx--${tone}`}>
      <div className="rwLabel">{title}</div>
      <Preview bubbles={bubbles} />
      {bubbles.map((b, i) => (
        <div key={i} className="rwExRow">
          <select value={b.type} disabled={disabled} onChange={e => patch(i, { type: e.target.value })}>
            {EXAMPLE_TYPES.map(([t, l]) => <option key={t} value={t}>{l}</option>)}
          </select>
          <div className="rwExField">
            <RichTextField field="content" value={b.content} highlights={b.highlights} onChange={p => patch(i, p)} placeholder="Текст ноды…" growTextarea />
          </div>
          <button className="rwBtn rwBtnDanger" disabled={disabled} title="Убрать ноду из примера" onClick={() => commit(bubbles.filter((_, k) => k !== i))}>×</button>
        </div>
      ))}
      <button className="rwBtn" disabled={disabled} onClick={() => commit([...bubbles, newBubble(bubbles.length ? 'text' : 'text')])}>+ нода</button>
    </div>
  )
}
