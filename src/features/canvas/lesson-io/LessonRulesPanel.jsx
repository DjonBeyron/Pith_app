import { useState, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLessonRules } from './useLessonRules.js'

// Textarea, растущая под весь текст без своего скролла — правило может
// быть длинным абзацем, и обрезать его до фиксированной высоты с внутренним
// скроллом неудобно читать: приходится крутить каждую строку отдельно от
// общего скролла списка. Высота пересчитывается на каждое изменение текста
// (высота списка при этом ведёт себя как обычный контент, скроллится один
// раз для всей панели).
function AutoTextarea({ value, ...props }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }, [value])
  return <textarea ref={ref} className="lrTextarea" value={value} rows={1} {...props} />
}

// Одна строка правила: своё черновое состояние текста, чтобы можно было
// печатать без сохранения на каждую букву — «Сохранить» появляется, только
// когда текст реально изменился.
function RuleRow({ rule, index, count, otherCategoryLabel, onEdit, onToggle, onMoveCategory, onDelete, onMoveUp, onMoveDown, busy }) {
  const [draft, setDraft] = useState(rule.text)
  const dirty = draft !== rule.text

  return (
    <div className={`lrRow${rule.active ? '' : ' lrRowInactive'}`}>
      <div className="lrRowSide">
        <button className="lrIconBtn" title="Выше" disabled={busy || index === 0}
          onClick={() => onMoveUp(rule.id)}>↑</button>
        <button className="lrIconBtn" title="Ниже" disabled={busy || index === count - 1}
          onClick={() => onMoveDown(rule.id)}>↓</button>
        <label className="lrActiveCheck" title="Включено в экспорт">
          <input type="checkbox" checked={rule.active}
            onChange={e => onToggle(rule.id, e.target.checked)} disabled={busy} />
        </label>
      </div>
      <AutoTextarea value={draft} onChange={e => setDraft(e.target.value)} disabled={busy} />
      <div className="lrRowActions">
        {dirty && (
          <button className="lrBtn lrBtnPrimary" disabled={busy}
            onClick={() => onEdit(rule.id, draft)}>Сохранить</button>
        )}
        <button className="lrBtn" disabled={busy} onClick={() => onMoveCategory(rule.id)}>
          {otherCategoryLabel}
        </button>
        <button className="lrIconBtn lrIconBtnDanger" title="Удалить" disabled={busy}
          onClick={() => onDelete(rule.id)}>×</button>
      </div>
    </div>
  )
}

// Одна секция (принципы ИЛИ чек-лист): список строк своей категории + своя
// строка добавления. Категории независимы — у каждой свой порядок (order
// считается внутри category, см. useLessonRules.js).
function RuleSection({ title, hint, items, category, otherCategoryLabel, api, newText, setNewText }) {
  const { edit, toggle, setCategory, remove, moveUp, moveDown, add, busy } = api

  function handleDelete(id) {
    if (!window.confirm('Удалить это правило? Оно пропадёт из легенды экспорта.')) return
    remove(id)
  }

  function handleMoveCategory(id) {
    setCategory(id, category === 'principle' ? 'checklist' : 'principle')
  }

  function handleAdd() {
    const text = newText.trim()
    if (!text) return
    add(text, category)
    setNewText('')
  }

  return (
    <div className="lrSection">
      <div className="lrSectionHead">{title}</div>
      <div className="lrHint">{hint}</div>
      <div className="lrList">
        {items.map((r, i) => (
          <RuleRow
            key={r.id} rule={r} index={i} count={items.length}
            otherCategoryLabel={otherCategoryLabel}
            onEdit={edit} onToggle={toggle} onMoveCategory={handleMoveCategory}
            onDelete={handleDelete} onMoveUp={moveUp} onMoveDown={moveDown} busy={busy}
          />
        ))}
        {!items.length && !busy && <div className="lrEmpty">Пусто</div>}
      </div>
      <div className="lrAddRow">
        <AutoTextarea
          placeholder="Новое правило…"
          value={newText}
          onChange={e => setNewText(e.target.value)}
        />
        <button className="lrBtn lrBtnPrimary" disabled={busy || !newText.trim()} onClick={handleAdd}>
          Добавить
        </button>
      </div>
    </div>
  )
}

// Редактор правил формирования урока (принципов легенды) — то, что раньше
// жило только в коде (lessonSchema.js:PRINCIPLES). Список хранится в
// Supabase (useLessonRules.js) и подставляется в экспорт LessonIoPanel'ом:
// любая правка тут сразу видна в следующем «Поделиться».
//
// Два раздела по category: принципы проверяются В МОМЕНТ написания
// конкретной ноды, чек-лист — только по готовому черновику целиком (см.
// PROJECT.md, «Легенда: правила формирования урока — из кода в БД»).
export default function LessonRulesPanel({ onClose }) {
  const api = useLessonRules()
  const { principles, checklist, busy, error, rules } = api
  const [newPrincipleText, setNewPrincipleText] = useState('')
  const [newChecklistText, setNewChecklistText] = useState('')

  return createPortal(
    // stopPropagation здесь, а не только на внутреннем модале: этот оверлей
    // рендерится ВНУТРИ LessonIoPanel (та же React-иерархия несмотря на
    // портал — синтетические события React бегут по дереву компонентов, не
    // по DOM), и без остановки клик по фону закрыл бы заодно и родительскую
    // панель «Поделиться / Импорт», а не только эту.
    <div className="lioOverlay" onMouseDown={e => { e.stopPropagation(); onClose() }}>
      <div className="lioModal lrModal" onMouseDown={e => e.stopPropagation()}>
        <div className="lioHeader">
          <span className="lioTitle">Правила формирования урока</span>
          <button className="lioClose" onClick={onClose}>×</button>
        </div>
        <div className="lioHint">
          Уходят в легенду экспорта вместе с уроком — их видит любой, кто получит JSON
          (в том числе нейросеть). Выключенный пункт (галочка снята) в экспорт не попадает,
          но остаётся в списке.
        </div>

        <div className="lrSections">
          <RuleSection
            title="Принципы" category="principle" otherCategoryLabel="→ в чек-лист"
            hint="Проверяются по ходу дела, в момент написания конкретной ноды."
            items={principles} api={api}
            newText={newPrincipleText} setNewText={setNewPrincipleText}
          />
          <RuleSection
            title="Чек-лист перед сдачей" category="checklist" otherCategoryLabel="→ в принципы"
            hint="Проверяются только по готовому черновику, целиком по всему уроку — перед тем как отдать урок."
            items={checklist} api={api}
            newText={newChecklistText} setNewText={setNewChecklistText}
          />
        </div>

        <div className="lioActions">
          <span className="lioMeta">
            {busy ? '…' : `${rules.length} правил, ${rules.filter(r => r.active).length} активных`}
          </span>
          {error && <span className="lioError">{error}</span>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
