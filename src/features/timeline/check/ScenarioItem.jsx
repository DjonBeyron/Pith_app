import TimelineLineEditor from '../TimelineLineEditor.jsx'
import { sec } from './lineCheck.js'

// Одна реплика в «Проверке сценария» (TimelineScenario.jsx): кто, текст, длительность, значки состояния (🔇 нет звука · ✏️ текст изменён · ⏱ длина · 👄 рот · ⚠ риск сцены). Нажатие раскрывает её карточку:
// что не так словами, «▶ Слушать с этой реплики» и ТА ЖЕ правка, что у клипа на ленте (TimelineLineEditor: текст, «Озвучить заново», свой файл, «Разметить рот заново») — не копия.
// x — реплика сценария с проверкой (scenarioCheck: { id, who, note, again, check }); open — раскрыта; on — сейчас звучит; playable — есть что играть.
const WHO = { pit: 'Пит', mia: 'Мия' }
const TONE = { todo: 'red', warn: 'red', note: 'yellow', ok: 'green', skip: 'green' }

export default function ScenarioItem({ x, open, on, playable, onToggle, onPlay, edit, innerRef }) {
  const c = x.check, icons = [...new Set(c.flags.map(f => f.icon))]
  return (
    <li ref={innerRef} className={`tlCkItem${on ? ' tlCkOn' : ''}`} data-who={x.who} data-tone={TONE[c.level]} data-open={open ? '1' : undefined} data-testid="tl-ck-item" data-id={x.id}>
      <button type="button" className="tlCkLine" aria-expanded={open} onClick={onToggle} title="Открыть карточку реплики: что не так, прослушать, поправить текст или озвучку">
        <i className="tlCkWho">{WHO[x.who] ?? x.who}</i>
        <span className="tlCkText">{c.text || x.id}{x.note && <em> — {x.note}</em>}{x.again && <em> — та же реплика, что выше</em>}</span>
        <span className="tlCkMeta">{c.dur ? sec(c.dur) : '—'}{icons.length > 0 && <b className="tlCkIcons" data-testid="tl-ck-icons"> {icons.join(' ')}</b>}{!icons.length && c.level === 'ok' && <b className="tlCkFine"> ✓</b>}</span>
      </button>
      {open && (
        <div className="tlCkCard" data-testid="tl-ck-card">
          {c.flags.length > 0 ? <ul className="tlCkFlags">{c.flags.map((f, i) => <li key={i} data-level={f.level}>{f.icon} {f.text}</li>)}</ul> : <p className="tlCkGood">✅ звук есть, говорит текущий текст, длина в порядке</p>}
          <div className="tlLeRow"><button type="button" className="tlBtn" disabled={!playable} onClick={onPlay} data-testid="tl-ck-play">▶ Слушать с этой реплики</button><small className="tlMuted">{x.id}</small></div>
          <TimelineLineEditor key={x.id} line={{ who: x.who, id: x.id, text: c.text }} edit={edit} />
        </div>
      )}
    </li>
  )
}
