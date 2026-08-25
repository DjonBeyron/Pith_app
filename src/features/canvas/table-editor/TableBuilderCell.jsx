import { useLayoutEffect, useRef } from 'react'

// Одна ячейка конструктора сетки: поле ввода текста + кнопка особых значений.
// Вынесена из TableGridBuilder.jsx, потому что ячейке нужен свой ref и свой
// эффект подгонки высоты (см. ниже) — в общем цикле рендера это невозможно.
//
// Зачем подгонка: <textarea> всегда рисует текст от ВЕРХНЕГО края. Пока поле
// по высоте равно ячейке, в обычной 1×1 это незаметно, но в объединённой
// (2×2 и больше) текст прилипал к потолку — хотя в уроке та же таблица
// показывает его по центру (TableGrid.jsx). Поэтому высоту поля равняем по
// самому тексту, а по центру ячейки его ставит flex (align-items: center).
export default function TableBuilderCell({
  cell, selectMode, selected, onValueChange, onOpenOptions, onMouseDown, onMouseEnter,
}) {
  const boxRef   = useRef(null)
  const inputRef = useRef(null)

  useLayoutEffect(() => {
    const el  = inputRef.current
    const box = boxRef.current
    if (!el || !box) return
    function fit() {
      el.style.height = 'auto'
      // Не выше самой ячейки: текст длиннее — поле скроллится внутри
      el.style.height = `${Math.min(el.scrollHeight, box.clientHeight)}px`
    }
    fit()
    // Ячейка меняет размер и без правки текста — тянут ручки колонок/строк,
    // добавляют строку, объединяют ячейки
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    return () => ro.disconnect()
  }, [cell.value, cell.fontSize])

  return (
    <div
      ref={boxRef}
      className={`tableBuilderCell${cell.isHeader ? ' tableBuilderCellHeader' : ''}${selected ? ' tableBuilderCellSelected' : ''}`}
      style={{
        gridColumn: `${cell.col + 1} / span ${cell.colspan}`,
        gridRow: `${cell.row + 1} / span ${cell.rowspan}`,
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
    >
      {/* Особые значения: ячейка выглядит как обычно, но в уроке из неё
          выпадает меню выбора. Кнопка не мешает вводу текста — она в углу и
          появляется по наведению (кроме ячеек, где варианты уже заданы:
          там она видна всегда) */}
      {!selectMode && (
        <button
          className={`tableBuilderOptsBtn${cell.options?.length ? ' tableBuilderOptsBtnOn' : ''}`}
          title={cell.options?.length
            ? `Особые значения (${cell.options.length}) — изменить`
            : 'Задать особые значения (выпадающее меню в уроке)'}
          onMouseDown={e => e.stopPropagation()}
          onClick={onOpenOptions}
        >☰</button>
      )}
      <textarea
        ref={inputRef}
        className="tableBuilderCellInput"
        value={cell.value}
        onChange={e => onValueChange(e.target.value)}
        onMouseDown={e => { if (!selectMode) e.stopPropagation() }}
        style={{
          pointerEvents: selectMode ? 'none' : 'auto', cursor: selectMode ? 'crosshair' : 'text',
          fontSize: cell.fontSize ? `${cell.fontSize}px` : undefined,
        }}
        placeholder="…"
      />
    </div>
  )
}
