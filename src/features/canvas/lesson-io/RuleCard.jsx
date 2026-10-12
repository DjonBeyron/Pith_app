import { useState, useRef, useLayoutEffect } from 'react'
import RuleExample from './RuleExample.jsx'
import { CHECKERS, SEVERITIES, ruleTitle, groupOf } from './ruleMeta.js'

// Textarea, растущая под текст без своего скролла (правило может быть длинным абзацем)
function Auto({ value, ...props }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return <textarea ref={ref} className="rwTextarea" value={value} rows={1} {...props} />
}

// Правая колонка окна правил: карточка одного правила. Черновик живёт здесь (кнопка «Сохранить» только при изменениях);
// key=rule.id в родителе пересоздаёт карточку при выборе другого правила
export default function RuleCard({ rule, groups, busy, onPatch, onToggle, onMoveCategory, onDelete }) {
  const [d, setD] = useState({ title: rule.title || ruleTitle(rule), group: groupOf(rule), text: rule.text, bad: rule.bad, good: rule.good })
  const set = k => e => setD(v => ({ ...v, [k]: e.target.value }))
  const dirty = d.title !== (rule.title || ruleTitle(rule)) || d.group !== groupOf(rule) || d.text !== rule.text || d.bad !== rule.bad || d.good !== rule.good

  return (
    <div className="rwCard">
      <input className="rwTitleInput" value={d.title} onChange={set('title')} disabled={busy} placeholder="Короткое название" />
      <div className="rwMetaRow">
        <label>Группа
          <input list="lr-groups" value={d.group} onChange={set('group')} disabled={busy} />
          <datalist id="lr-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
        </label>
        <label>Кто проверяет
          <select value={rule.checker} disabled={busy} onChange={e => onPatch(rule.id, { checker: e.target.value })}>
            {CHECKERS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
        </label>
        <label>Серьёзность
          <select value={rule.severity} disabled={busy} onChange={e => onPatch(rule.id, { severity: e.target.value })}>
            {SEVERITIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="rwActiveCheck" title="Включено в экспорт и промпт">
          <input type="checkbox" checked={rule.active} disabled={busy} onChange={e => onToggle(rule.id, e.target.checked)} /> В экспорте
        </label>
      </div>

      <div className="rwLabel">Текст правила (уходит в легенду и промпт)</div>
      <Auto value={d.text} onChange={set('text')} disabled={busy} />

      <div className="rwExamples">
        <RuleExample tone="bad" title="❌ Нельзя" value={d.bad} disabled={busy} onChange={v => setD(x => ({ ...x, bad: v }))} />
        <RuleExample tone="good" title="✅ Можно" value={d.good} disabled={busy} onChange={v => setD(x => ({ ...x, good: v }))} />
      </div>

      <div className="rwCardActions">
        {dirty && <button className="rwBtn rwBtnPrimary" disabled={busy} onClick={() => onPatch(rule.id, { title: d.title === ruleTitle(rule) ? '' : d.title, group: d.group, text: d.text, bad: d.bad, good: d.good })}>Сохранить</button>}
        <button className="rwBtn" disabled={busy} onClick={() => onMoveCategory(rule.id)}>
          {rule.category === 'principle' ? '→ в чек-лист' : '→ в принципы'}
        </button>
        <button className="rwBtn rwBtnDanger" disabled={busy} onClick={() => onDelete(rule.id)}>Удалить</button>
      </div>
    </div>
  )
}
