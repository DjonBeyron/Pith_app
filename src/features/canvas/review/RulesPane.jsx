import { useState } from 'react'
import { ruleTitle, checkerOf } from '../lesson-io/ruleMeta.js'
import { parseExample } from '../lesson-io/ruleExample.js'
import { Preview } from '../lesson-io/RuleExample.jsx'
import { ruleForWarning, rulesForNode, nodeToExampleLine } from './reviewRules.js'

function RuleRow({ rule, open, onToggle }) {
  const c = checkerOf(rule.checker)
  return (
    <div className={`rvwRule${open ? ' open' : ''}`}>
      <div className="rvwRuleHead" onClick={onToggle}>
        <span title={c.hint}>{c.icon}</span><span className="rvwRuleTitle">{ruleTitle(rule)}</span>
        <span className={`rvwSev ${rule.severity}`}>{rule.severity === 'error' ? 'ошибка' : 'совет'}</span>
      </div>
      {open && (
        <div className="rvwRuleBody">
          <p>{rule.text}</p>
          {rule.bad && <><div className="rvwRuleLbl">❌ Нельзя</div><Preview bubbles={parseExample(rule.bad)} /></>}
          {rule.good && <><div className="rvwRuleLbl">✅ Можно</div><Preview bubbles={parseExample(rule.good)} /></>}
        </div>
      )}
    </div>
  )
}

// Форма «своё правило»: пример подставляется из ноды в фокусе (как ❌ или ✅ — на выбор)
function NewRule({ node, busy, onAdd }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [as, setAs] = useState('bad')
  if (!open) return <button className="rvwBtn" onClick={() => setOpen(true)}>+ Своё правило</button>
  const save = () => {
    const ex = node ? nodeToExampleLine(node) : ''
    onAdd({ title: title.trim(), text: text.trim(), category: 'principle', group: '', checker: 'manual', severity: 'warn', bad: as === 'bad' ? ex : '', good: as === 'good' ? ex : '' })
    setOpen(false); setTitle(''); setText('')
  }
  return (
    <div className="rvwNew">
      <input placeholder="Короткое название" value={title} onChange={e => setTitle(e.target.value)} />
      <textarea rows={3} placeholder="Суть правила — что и почему" value={text} onChange={e => setText(e.target.value)} />
      {node && (
        <label className="rvwNewEx">Пример из ноды {node.seq}:
          <select value={as} onChange={e => setAs(e.target.value)}><option value="bad">❌ как нельзя</option><option value="good">✅ как можно</option><option value="none" disabled hidden>—</option></select>
        </label>
      )}
      <div className="rvwNewBtns">
        <button className="rvwBtn rvwBtnPrimary" disabled={busy || !text.trim() || !title.trim()} onClick={save}>Сохранить правило</button>
        <button className="rvwBtn" onClick={() => setOpen(false)}>Отмена</button>
      </div>
    </div>
  )
}

export default function RulesPane({ node, warnings, rules, busy, onAdd }) {
  const [openId, setOpenId] = useState(null)
  const [q, setQ] = useState('')
  const toggle = id => setOpenId(v => (v === id ? null : id))
  const forNode = rulesForNode(node, rules)
  const found = q.trim() ? rules.filter(r => `${ruleTitle(r)} ${r.text}`.toLowerCase().includes(q.trim().toLowerCase())) : []
  return (
    <div className="rvwRules">
      {warnings.length > 0 && (
        <div className="rvwSection">
          <div className="rvwSectionHead">⚠ Замечания по этой ноде</div>
          {warnings.map((w, i) => {
            const rule = ruleForWarning(w, rules)
            return <div key={i} className="rvwWarnRow"><span>{w}</span>{rule && <button className="rvwBtn" onClick={() => setOpenId(rule.id)}>→ правило</button>}</div>
          })}
        </div>
      )}
      <div className="rvwSection">
        <div className="rvwSectionHead">{node ? `Правила для «${node.type}» и про порядок (${forNode.length})` : 'Правила'}</div>
        {forNode.map(r => <RuleRow key={r.id} rule={r} open={openId === r.id} onToggle={() => toggle(r.id)} />)}
        {node && !forNode.length && <div className="rvwEmpty">Для этого типа нет отдельных правил</div>}
      </div>
      <div className="rvwSection">
        <div className="rvwSectionHead">Поиск по всем правилам</div>
        <input className="rvwSearch" placeholder="Начни вводить…" value={q} onChange={e => setQ(e.target.value)} />
        {found.map(r => <RuleRow key={r.id} rule={r} open={openId === r.id} onToggle={() => toggle(r.id)} />)}
      </div>
      <NewRule key={node?.ref ?? 'none'} node={node} busy={busy} onAdd={onAdd} />
    </div>
  )
}
