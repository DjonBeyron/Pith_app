// Тулбар конструктора сетки — иконками, а не подписями: кнопок стало много,
// текстом они занимали две строки и терялись. У каждой — title с описанием,
// что она делает (видно по наведению).
//
// Иконки-подсказки: ▤ — строки (горизонтальные линии), ▥ — колонки
// (вертикальные), ▭ — одна большая ячейка (объединить), ⊞ — сетка из клеток
// (разбить обратно).
export default function TableBuilderToolbar({
  table, selectMode, onToggleSelectMode,
  // fontControl — сводка по размеру текста выделенных ячеек (одна или много):
  // { label, count, canDown, canUp }; null — ничего не выделено
  canMerge, canSplit, hasSelection, isHeaderSelected, fontControl, canUndo,
  onAddRow, onRemoveRow, onAddColumn, onRemoveColumn,
  onMerge, onSplit, onToggleHeader, onClearSelection, onBumpFontSize, onAutoFit, onUndo,
}) {
  // Есть выделение — минусы бьют по нему (конкретные строки/колонки),
  // нет — отрезают последнюю полосу, как раньше
  const aimed = selectMode && hasSelection
  return (
    <div className="tblToolbar">
      <div className="tblGroup">
        <button className="tblBtn" onClick={onAddRow} title="Добавить строку снизу">+▤</button>
        <button className="tblBtn" onClick={onRemoveRow} disabled={table.rowCount <= 1}
          title={aimed ? 'Удалить выделенные строки' : 'Убрать последнюю строку'}>−▤</button>
        <button className="tblBtn" onClick={onAddColumn} title="Добавить колонку справа">+▥</button>
        <button className="tblBtn" onClick={onRemoveColumn} disabled={table.colCount <= 1}
          title={aimed ? 'Удалить выделенные колонки' : 'Убрать последнюю колонку'}>−▥</button>
      </div>

      <div className="tblDivider" />

      <button
        className={`tblBtn tblBtnWide${selectMode ? ' tblBtnOn' : ''}`}
        onClick={onToggleSelectMode}
        title={selectMode
          ? 'Сейчас режим выделения: протащите мышью по ячейкам. Нажмите, чтобы вернуться к вводу текста'
          : 'Режим выделения ячеек: объединить, разбить, сделать заголовком'}
      >⬚ {selectMode ? 'Выделение' : 'Выделить'}</button>

      {selectMode && (
        <>
          <div className="tblGroup">
            <button className="tblBtn" onClick={onMerge} disabled={!canMerge}
              title="Объединить выделенные ячейки в одну">▭</button>
            <button className="tblBtn" onClick={onSplit} disabled={!canSplit}
              title="Разбить объединённые ячейки выделения обратно на отдельные">⊞</button>
            <button className={`tblBtn${isHeaderSelected ? ' tblBtnOn' : ''}`}
              onClick={onToggleHeader} disabled={!hasSelection}
              title="Заголовок: текст жирнее, фон ячейки чуть темнее — навсегда, не по времени">H</button>
            <button className="tblBtn" onClick={onClearSelection} disabled={!hasSelection}
              title="Снять выделение">✕</button>
          </div>

          {fontControl && (
            <div
              className="tblFontSize"
              title={fontControl.count > 1
                ? `Размер текста выделенных ячеек (${fontControl.count})`
                : 'Размер текста этой ячейки'}
            >
              <button className="tblBtn" onClick={() => onBumpFontSize(-1)} disabled={!fontControl.canDown}
                title="Уменьшить текст во всех выделенных ячейках">A−</button>
              <span className="tblFontVal">{fontControl.label}</span>
              <button className="tblBtn" onClick={() => onBumpFontSize(1)} disabled={!fontControl.canUp}
                title="Увеличить текст во всех выделенных ячейках">A+</button>
            </div>
          )}
        </>
      )}

      <div className="tblDivider" />

      <button className="tblBtn" onClick={onUndo} disabled={!canUndo}
        title="Отменить последнее действие (помнит 10 шагов, Ctrl+Z)">↶</button>

      <button className="tblBtn" onClick={onAutoFit}
        title="Подобрать размер текста в каждой ячейке так, чтобы он помещался даже на маленьком iPhone SE">🔤</button>
    </div>
  )
}
