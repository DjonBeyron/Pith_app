import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useLessonRules } from './useLessonRules.js'
import RuleCard from './RuleCard.jsx'
import { buildAuthorPrompt } from './authorPrompt.js'
import { PRINCIPLES, PRE_SUBMIT_CHECKLIST } from './lessonRulesDefaults.js'
import { CHECKERS, checkerOf, groupOf, ruleTitle, ruleMatches } from './ruleMeta.js'

// Окно правил формирования урока на весь экран (ПК): слева группы, посередине список (название + значок «кто проверяет»),
// справа карточка выбранного правила с примерами «нельзя / можно». Хранится в Supabase (useLessonRules.js) и подставляется
// в легенду экспорта: любая правка видна в следующем «Поделиться». На телефоне колонки складываются в одну (CSS).
// Два вида по category: принципы — в момент написания ноды, чек-лист — по готовому черновику целиком (PROJECT.md, «Легенда…»).
export default function LessonRulesPanel({ onClose }) {
  const api = useLessonRules()
  const { rules, busy, error, seedDefaults, add, patch, toggle, setCategory, remove, moveUp, moveDown } = api
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('')
  const [checker, setChecker] = useState('')
  const [onlyActive, setOnlyActive] = useState(false)
  const [selId, setSelId] = useState(null)
  const [newText, setNewText] = useState('')
  const [copied, setCopied] = useState('')

  const groups = useMemo(() => [...new Set(rules.map(groupOf))].sort(), [rules])
  const shown = rules.filter(r => ruleMatches(r, { q, group, checker, onlyActive }))
  const sel = rules.find(r => r.id === selId) ?? null
  const countBy = g => rules.filter(r => groupOf(r) === g).length

  function handleDelete(id) {
    if (!window.confirm('Удалить это правило? Оно пропадёт из легенды экспорта.')) return
    remove(id)
    setSelId(null)
  }
  async function copyPrompt() {
    try {
      const topic = window.prompt('Тема урока (можно оставить пустой — вставишь потом):', '') ?? ''
      await navigator.clipboard.writeText(buildAuthorPrompt(rules, { topic }))
      setCopied('Промпт скопирован')
    } catch { setCopied('Не удалось скопировать') }
    setTimeout(() => setCopied(''), 2500)
  }
  // Выгрузка правил целиком (JSON) — Claude сохраняет её в lesson-drafts/rules.json и генерирует/проверяет уроки по твоим актуальным правилам
  async function copyRulesJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(rules, null, 1))
      setCopied('Правила скопированы — вставь их в чат с Claude')
    } catch { setCopied('Не удалось скопировать') }
    setTimeout(() => setCopied(''), 2500)
  }
  function handleAdd() {
    const text = newText.trim()
    if (!text) return
    add(text, 'principle')
    setNewText('')
  }

  return createPortal(
    // stopPropagation: оверлей рендерится внутри LessonIoPanel (React-иерархия идёт через портал) — без него клик по фону
    // закрыл бы заодно и родительскую панель «Поделиться / Импорт»
    <div className="lrFull" onMouseDown={e => e.stopPropagation()}>
      <div className="lrTop">
        <span className="lioTitle">Правила формирования урока</span>
        <input className="lrSearch" placeholder="Поиск по правилам…" value={q} onChange={e => setQ(e.target.value)} />
        <select value={checker} onChange={e => setChecker(e.target.value)}>
          <option value="">Все проверки</option>
          {CHECKERS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
        </select>
        <label className="lrActiveCheck"><input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} /> Только включённые</label>
        <button className="lrBtn lrBtnPrimary" disabled={busy || !rules.length} title={rules.length ? '' : 'Сначала загрузи правила в базу'} onClick={copyPrompt}>📋 Промпт для ИИ</button>
        <button className="lrBtn" disabled={busy || !rules.length} title={rules.length ? '' : 'Сначала загрузи правила в базу'} onClick={copyRulesJson}>⬇ Правила для Claude</button>
        {copied && <span className="lioMeta">{copied}</span>}
        <span className="lioMeta">{busy ? '…' : `${shown.length} из ${rules.length}`}</span>
        {error && <span className="lioError">{error}</span>}
        <button className="lioClose" onClick={onClose}>×</button>
      </div>

      {!busy && !rules.length && (
        <div className="lrSeed">
          {error ? `Не удалось загрузить правила: ${error}` : 'В базе пока нет правил — до этого момента в легенду шли стандартные, зашитые в код.'}
          {!error && <button className="lrBtn lrBtnPrimary" onClick={seedDefaults}>Загрузить {PRINCIPLES.length + PRE_SUBMIT_CHECKLIST.length} стандартных правил в базу</button>}
        </div>
      )}
      <div className="lrCols">
        <div className="lrGroups">
          <button className={`lrGroupBtn${group === '' ? ' on' : ''}`} onClick={() => setGroup('')}>Все <b>{rules.length}</b></button>
          {groups.map(g => (
            <button key={g} className={`lrGroupBtn${group === g ? ' on' : ''}`} onClick={() => setGroup(g)}>{g} <b>{countBy(g)}</b></button>
          ))}
        </div>

        <div className="lrListCol">
          {shown.map(r => {
            const c = checkerOf(r.checker)
            return (
              <div key={r.id} className={`lrItem${r.id === selId ? ' on' : ''}${r.active ? '' : ' off'}`} onClick={() => setSelId(r.id)}>
                <span className="lrItemIcon" title={c.hint}>{c.icon}</span>
                <span className="lrItemTitle">{ruleTitle(r)}</span>
                <span className={`lrSev ${r.severity}`}>{r.severity === 'error' ? 'ошибка' : 'совет'}</span>
                <span className="lrItemCat">{r.category === 'checklist' ? 'чек-лист' : ''}</span>
                <span className="lrItemMove">
                  <button title="Выше" disabled={busy} onClick={e => { e.stopPropagation(); moveUp(r.id) }}>↑</button>
                  <button title="Ниже" disabled={busy} onClick={e => { e.stopPropagation(); moveDown(r.id) }}>↓</button>
                </span>
              </div>
            )
          })}
          {!shown.length && !busy && <div className="lrEmpty">Ничего не найдено</div>}
          <div className="lrAddRow">
            <textarea className="lrTextarea" rows={2} placeholder="Новое правило…" value={newText} onChange={e => setNewText(e.target.value)} />
            <button className="lrBtn lrBtnPrimary" disabled={busy || !newText.trim()} onClick={handleAdd}>Добавить</button>
          </div>
        </div>

        <div className="lrCardCol">
          {sel
            ? <RuleCard key={sel.id} rule={sel} groups={groups} busy={busy} onPatch={patch} onToggle={toggle} onMoveCategory={id => setCategory(id, sel.category === 'principle' ? 'checklist' : 'principle')} onDelete={handleDelete} />
            : <div className="lrEmpty">Выбери правило слева — здесь откроется карточка с примерами «нельзя / можно»</div>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
