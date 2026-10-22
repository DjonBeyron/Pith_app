import { useState, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLessonRules } from './useLessonRules.js'
import RuleCard from './RuleCard.jsx'
import { SEED_RULES, RETIRED_TITLES } from './lessonRulesSeed.js'
import { planSync, syncIsEmpty, syncSummary } from './rulesSync.js'
import { downloadRulesJson } from './rulesExport.js'
import { CHECKERS, checkerOf, groupOf, ruleTitle, ruleMatches } from './ruleMeta.js'
import { APP_VERSION } from '../../../shared/lib/version.js'

// Окно правил формирования урока на весь экран (ПК): слева группы, посередине список (название + значок «кто проверяет»),
// справа карточка выбранного правила с примерами «нельзя / можно». Хранится в Supabase (useLessonRules.js) и подставляется
// в легенду экспорта: любая правка видна в следующем «Поделиться». На телефоне колонки складываются в одну (CSS).
// Два вида по category: принципы — в момент написания ноды, чек-лист — по готовому черновику целиком (PROJECT.md, «Легенда…»).
// Три вида по category: principle → checklist → reference (справка по модулям, судье не идёт) → principle
const NEXT_CATEGORY = { principle: 'checklist', checklist: 'reference', reference: 'principle' }
const CAT_LABEL = { checklist: 'чек-лист', reference: 'справка' }

export default function LessonRulesPanel({ onClose }) {
  const api = useLessonRules()
  const { rules, busy, error, seedDefaults, syncFromSeed, add, patch, toggle, setCategory, remove, moveUp, moveDown } = api
  const syncPlan = useMemo(() => planSync(rules, SEED_RULES, RETIRED_TITLES), [rules])
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('')
  const [checker, setChecker] = useState('')
  const [onlyActive, setOnlyActive] = useState(false)
  const [selId, setSelId] = useState(null)
  const [newText, setNewText] = useState('')

  // Esc закрывает окно
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const groups = useMemo(() => [...new Set(rules.map(groupOf))].sort(), [rules])
  const shown = rules.filter(r => ruleMatches(r, { q, group, checker, onlyActive }))
  const sel = rules.find(r => r.id === selId) ?? null
  const countBy = g => rules.filter(r => groupOf(r) === g).length

  function handleDelete(id) {
    if (!window.confirm('Удалить это правило? Оно пропадёт из легенды экспорта.')) return
    remove(id)
    setSelId(null)
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
    <div className="rwFull" onMouseDown={e => e.stopPropagation()}>
      <div className="rwTop">
        <div className="rwTopRow">
          <button className="rwBack" onClick={onClose}>← Назад</button>
          <span className="lioTitle">Правила формирования урока</span>
          <input className="rwSearch" placeholder="Поиск по правилам…" value={q} onChange={e => setQ(e.target.value)} />
          <select value={checker} onChange={e => setChecker(e.target.value)}>
            <option value="">Все проверки</option>
            {CHECKERS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
          <button className={`rwToggle${onlyActive ? ' on' : ''}`} onClick={() => setOnlyActive(v => !v)}>{onlyActive ? '✓ Только включённые' : 'Только включённые'}</button>
          <span className="lioMeta">{busy ? 'загрузка…' : `показано ${shown.length} из ${rules.length} · включено ${rules.filter(r => r.active).length}`}</span>
          <button className="rwBtn" disabled={busy || !rules.length} title="Скачать rules.json — его читают скрипты генератора уроков (lesson-drafts/rules.json)" onClick={() => downloadRulesJson(rules)}>⬇ Правила для Claude</button>

        </div>
      </div>

      {error && rules.length > 0 && <div className="rwErr">{error}</div>}
      {!busy && !rules.length && (
        <div className="rwSeed">
          {error ? `Не удалось загрузить правила: ${error}` : 'В базе пока нет правил — до этого момента в легенду шли стандартные, зашитые в код.'}
          {!error && <button className="rwBtn rwBtnPrimary" onClick={seedDefaults}>Загрузить {SEED_RULES.length} стандартных правил в базу</button>}
        </div>
      )}
      {!busy && rules.length > 0 && !syncIsEmpty(syncPlan) && (
        <div className="rwSeed">
          База отличается от стандартного набора ({syncSummary(syncPlan)}). Перед изменением весь список сохранится в историю (lesson_rules_history).
          <button className="rwBtn rwBtnPrimary" onClick={() => { if (window.confirm(`Синхронизировать правила со стандартом: ${syncSummary(syncPlan)}?`)) syncFromSeed(`до синхронизации со стандартом (v${APP_VERSION})`) }}>Синхронизировать со стандартом</button>
        </div>
      )}
      <div className="rwCols">
        <div className="rwGroups">
          <button className={`rwGroupBtn${group === '' ? ' on' : ''}`} onClick={() => setGroup('')}>Все <b>{rules.length}</b></button>
          {groups.map(g => (
            <button key={g} className={`rwGroupBtn${group === g ? ' on' : ''}`} onClick={() => setGroup(g)}>{g} <b>{countBy(g)}</b></button>
          ))}
        </div>

        <div className="rwListCol">
          {shown.map(r => {
            const c = checkerOf(r.checker)
            return (
              <div key={r.id} className={`rwItem${r.id === selId ? ' on' : ''}${r.active ? '' : ' off'}`} onClick={() => setSelId(r.id)}>
                <button className={`rwItemOn${r.active ? ' on' : ''}`} title={r.active ? 'Включено — уходит в экспорт и промпт. Нажми, чтобы выключить' : 'Выключено. Нажми, чтобы включить'}
                  onClick={e => { e.stopPropagation(); toggle(r.id, !r.active) }}>{r.active ? '● вкл' : '○ выкл'}</button>
                <span className="rwItemIcon" title={c.hint}>{c.icon}</span>
                <span className="rwItemTitle">{ruleTitle(r)}</span>
                <span className={`rwSev ${r.severity}`}>{r.severity === 'error' ? 'ошибка' : 'совет'}</span>
                <span className="rwItemCat">{CAT_LABEL[r.category] ?? ''}</span>
                <span className="rwItemMove">
                  <button title="Выше" disabled={busy} onClick={e => { e.stopPropagation(); moveUp(r.id) }}>↑</button>
                  <button title="Ниже" disabled={busy} onClick={e => { e.stopPropagation(); moveDown(r.id) }}>↓</button>
                </span>
              </div>
            )
          })}
          {!shown.length && !busy && <div className="rwEmpty">Ничего не найдено</div>}
          <div className="rwAddRow">
            <textarea className="rwTextarea" rows={2} placeholder="Новое правило…" value={newText} onChange={e => setNewText(e.target.value)} />
            <button className="rwBtn rwBtnPrimary" disabled={busy || !newText.trim()} onClick={handleAdd}>Добавить</button>
          </div>
        </div>

        <div className="rwCardCol">
          {sel
            ? <RuleCard key={sel.id} rule={sel} groups={groups} busy={busy} onPatch={patch} onToggle={toggle} onMoveCategory={id => setCategory(id, NEXT_CATEGORY[sel.category] ?? 'principle')} onDelete={handleDelete} />
            : <div className="rwEmpty">Выбери правило слева — здесь откроется карточка с примерами «нельзя / можно»</div>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
