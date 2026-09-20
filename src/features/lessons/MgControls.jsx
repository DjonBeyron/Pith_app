// Управляющие элементы карточек схемы модуля — вынесены из ModuleGraph.jsx:
// компоненты нельзя объявлять внутри рендера (react-hooks/static-components),
// иначе React пересоздаёт их DOM на каждом рендере.

// Поле переименования урока (админ, кнопка ✎)
export function MgRenameInput({ draft, onDraft, onCommit, onCancel }) {
  return (
    <input className="mgRenameInput" autoFocus value={draft}
      onChange={e => onDraft(e.target.value)} onBlur={onCommit}
      onKeyDown={e => { if (e.key === 'Enter') onCommit(); if (e.key === 'Escape') onCancel() }}
      onClick={e => e.stopPropagation()} />
  )
}

// Кнопки карточки (только админ): ▶ запуск, ⚙ редактор (граф или продакшен —
// какой использовали последним, см. lastEditorMode.js), ✎ переименовать,
// ⟲ сброс урока, ✔ тест «пометить пройденным», 👁 публикация, ↑↓ порядок
// и ✕ удалить (последние — только у обычных уроков: Старт и Финал
// неподвижны и неудаляемы). canUp/canDown — есть ли куда двигать
export function MgBtns({
  l, kind, isAdmin, show, canUp = false, canDown = false,
  onPlay, onEdit, onRenameStart, onResetLesson, onMarkDoneLesson, onTogglePublished, onDelete, onMove, clearTap,
}) {
  // Обычный пользователь запускает урок тапом/кликом по карточке (handleClick) —
  // кнопок у него нет вовсе, в том числе ▶.
  if (!isAdmin) return null
  return (
    <div className={`mgNodeBtns${show ? ' mgNodeBtns--vis' : ''}`}
      onClick={e => e.stopPropagation()}>
      <button className="mgBtn" onClick={() => { onPlay(l.id); clearTap() }}>▶</button>
      <button className="mgBtn" onClick={() => { onEdit(l.id); clearTap() }}>⚙</button>
      <button className="mgBtn" onClick={e => { onRenameStart(e, l.id, l.title); clearTap() }}>✎</button>
      <button className="mgBtn" title="Сбросить прохождение этого урока (XP отнимется, анализ сохранится)"
        onClick={() => { onResetLesson?.(l.id); clearTap() }}>⟲</button>
      <button className="mgBtn" title="Тест: пометить этот урок пройденным (без начисления XP)"
        onClick={() => { onMarkDoneLesson?.(l.id); clearTap() }}>✔</button>
      <button className={`mgBtn mgBtnEye${l.published ? ' mgBtnEyeOn' : ''}`}
        title={l.published ? 'Скрыть' : 'Показать'}
        onClick={() => { onTogglePublished(l.id, l.published); clearTap() }}>
        {l.published ? '👁' : '🚫'}
      </button>
      {kind === 'lesson' && (
        <>
          <button className="mgBtn" title="Выше" disabled={!canUp}
            onClick={() => { onMove?.(l.id, -1); clearTap() }}>↑</button>
          <button className="mgBtn" title="Ниже" disabled={!canDown}
            onClick={() => { onMove?.(l.id, 1); clearTap() }}>↓</button>
          <button className="mgBtn mgBtnDel" onClick={() => { onDelete(l.id); clearTap() }}>✕</button>
        </>
      )}
    </div>
  )
}
