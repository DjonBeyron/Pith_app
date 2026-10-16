import { memo, useState } from 'react'
import SceneThumb from './SceneThumb.jsx'
import SceneRowChips from './SceneRowChips.jsx'
import SceneRowActions from './SceneRowActions.jsx'
import { rowStatus } from './sceneRows.js'
import { ruleHint } from './sceneTabHelp.js'

const STATUS_TEXT = { err: 'есть ошибки', warn: 'есть предупреждения', ok: 'линтер без замечаний' }

// Реплики: статичная — реальные фразы, динамичная — шаблон с подсвеченными {словами} и запасным словом
function Lines({ lines }) {
  return (
    <ul className="scTabLines">
      {lines.map((l, i) => (
        <li key={i}><b>{l.name}:</b> {l.parts.map((p, j) => (p.slot
          ? <mark key={j} className="scTabSlot" title={`запасное слово: ${p.word}`}>{`{${p.slot}}`}<i>{p.word ? ` → ${p.word}` : ''}</i></mark>
          : <span key={j}>{p.text}</span>))}</li>
      ))}
    </ul>
  )
}

function SceneTabRow({ row, handlers, busy }) {
  const { base, issues } = row
  const [open, setOpen] = useState(false)
  const [asking, setAsking] = useState(false)
  const status = rowStatus(row)
  const errs = [...base.errors, ...issues.filter(i => i.level === 'error').map(i => i.text)]
  const warns = [...base.warns, ...issues.filter(i => i.level === 'warn').map(i => i.text)]
  const bound = {
    edit: () => handlers.edit(row.id), go: () => handlers.go(row.id), play: () => handlers.play(row.id),
    dup: () => handlers.dup(row.id), del: () => { setAsking(false); handlers.del(row.id) },
  }
  return (
    <li className={`scTabRow scTabRow--${status}`} data-node-id={row.id}>
      <SceneThumb scene={base.preview} mode={base.mode} empty={base.state === 'empty' ? '🐱' : '⚠'} />
      <div className="scTabBody">
        <div className="scTabHead">
          <span className="scTabNum" title="Номер ноды в уроке">№{row.seq}</span>
          <span className="scTabTitle">{base.state === 'empty' ? 'Сцена не выбрана' : base.title}</span>
          <span className={`scTabState scTabState--${status}`} title={STATUS_TEXT[status]} role="img" aria-label={STATUS_TEXT[status]} />
          {base.sceneId && <span className="scTabLib" title="Снимок из библиотеки сцен">из библиотеки</span>}
        </div>
        <SceneRowChips base={base} />
        {base.lines.length > 0 && (
          <>
            <button type="button" className="scTabMore" aria-expanded={open} onClick={() => setOpen(v => !v)}>
              {open ? 'Скрыть реплики ▴' : 'Реплики ▾'}
            </button>
            {open && <Lines lines={base.lines} />}
          </>
        )}
        {(errs.length > 0 || warns.length > 0) && (
          <ul className="scTabIssues">
            {errs.map((t, i) => <li key={`e${i}`} className="scTabIssue scTabIssue--err">{t}</li>)}
            {warns.map((t, i) => <li key={`w${i}`} className="scTabIssue scTabIssue--warn">{t}</li>)}
            {issues[0] && <li className="scTabIssueHint">Как исправить: {ruleHint(issues[0].code)}</li>}
          </ul>
        )}
        <SceneRowActions
          seq={row.seq} confirming={asking} onAsk={() => setAsking(true)} onCancel={() => setAsking(false)}
          handlers={bound} disabled={busy}
        />
      </div>
    </li>
  )
}

// Перерисовка только при смене самой сцены/номера/нарушений правил (handlers стабильны)
const same = (a, b) => a.busy === b.busy && a.handlers === b.handlers && a.row.id === b.row.id && a.row.seq === b.row.seq
  && a.row.base === b.row.base && a.row.issues.length === b.row.issues.length
  && a.row.issues.every((x, i) => x.text === b.row.issues[i].text)

export default memo(SceneTabRow, same)
