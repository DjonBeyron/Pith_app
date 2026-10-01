// Редакторы блоков справки слова (кроме диалога — WordCardDialogEditor): текст, таблица,
// формула, случаи. Каждый получает блок b и onChange(patch) — патч поверх блока.
// Подсказка про **звёздочки**: слово в них ученик увидит лаймом

const swap = (list, i, patch) => list.map((v, k) => (k === i ? patch : v))

function In({ value, onChange, placeholder, max = 80, className = '' }) {
  return (
    <input
      className={'wcEdIn ' + className}
      value={value}
      placeholder={placeholder}
      maxLength={max}
      onChange={e => onChange(e.target.value)}
    />
  )
}

export function TextEditor({ b, onChange }) {
  return (
    <>
      <textarea
        className="wcEdIn wcEdArea"
        rows={3}
        maxLength={600}
        value={b.text}
        placeholder="Пояснение для новичка. Слово в **звёздочках** станет лаймовым"
        onChange={e => onChange({ text: e.target.value })}
      />
    </>
  )
}

export function TableEditor({ b, onChange }) {
  const cols = b.head.length
  const setCell = (r, c, v) => onChange({ rows: swap(b.rows, r, swap(b.rows[r], c, v)) })
  const addCol = () => onChange({ head: [...b.head, ''], rows: b.rows.map(r => [...r, '']) })
  const dropCol = () => onChange({ head: b.head.slice(0, -1), rows: b.rows.map(r => r.slice(0, -1)) })
  const dropRow = i => onChange({
    rows: b.rows.filter((_, k) => k !== i),
    mark: b.mark == null || b.mark === i ? null : b.mark > i ? b.mark - 1 : b.mark,
  })
  return (
    <>
      <div className="wcEdGrid" style={{ '--n': cols }}>
        {b.head.map((h, c) => (
          <In key={c} className="wcEdHead" value={h} placeholder={`Столбец ${c + 1}`} max={30} onChange={v => onChange({ head: swap(b.head, c, v) })} />
        ))}
        <span />
        {b.rows.map((r, i) => [
          ...r.map((cell, c) => <In key={`${i}-${c}`} value={cell} onChange={v => setCell(i, c, v)} />),
          <button key={`x${i}`} className="wcEdMini" onClick={() => dropRow(i)} aria-label={`Убрать строку ${i + 1}`}>✕</button>,
        ])}
      </div>
      <div className="wcEdRow">
        <label className="wcEdSel">
          Строка «в вашей фразе»:
          <select value={b.mark ?? ''} onChange={e => onChange({ mark: e.target.value === '' ? null : Number(e.target.value) })}>
            <option value="">нет</option>
            {b.rows.map((r, i) => <option key={i} value={i}>{i + 1}. {r.find(c => c.trim()) || 'пустая'}</option>)}
          </select>
        </label>
        <button className="wcEdBtn" disabled={b.rows.length >= 8} onClick={() => onChange({ rows: [...b.rows, Array(cols).fill('')] })}>＋ строка</button>
        <button className="wcEdBtn" disabled={cols >= 4} onClick={addCol}>＋ столбец</button>
        <button className="wcEdBtn" disabled={cols <= 2} onClick={dropCol}>− столбец</button>
      </div>
    </>
  )
}

export function FormulaEditor({ b, onChange }) {
  return (
    <>
      <div className="wcEdRow wcEdWrap">
        {b.parts.map((p, i) => (
          <span key={i} className="wcEdPart">
            {i > 0 && <span className="wcEdOp">+</span>}
            <In className="wcEdChip" value={p} placeholder="кусочек" max={40} onChange={v => onChange({ parts: swap(b.parts, i, v) })} />
            {b.parts.length > 2 && <button className="wcEdMini" onClick={() => onChange({ parts: b.parts.filter((_, k) => k !== i) })} aria-label="Убрать кусочек">✕</button>}
          </span>
        ))}
        <span className="wcEdOp">=</span>
        <In className="wcEdChip" value={b.result} placeholder="результат" max={60} onChange={v => onChange({ result: v })} />
      </div>
      <div className="wcEdRow">
        <button className="wcEdBtn" disabled={b.parts.length >= 5} onClick={() => onChange({ parts: [...b.parts, ''] })}>＋ кусочек</button>
      </div>
    </>
  )
}

export function CasesEditor({ b, onChange }) {
  const set = (i, patch) => onChange({ items: swap(b.items, i, { ...b.items[i], ...patch }) })
  return (
    <>
      {b.items.map((it, i) => (
        <div key={i} className="wcEdCase">
          <div className="wcEdRow">
            <In value={it.label} placeholder="Когда (напр. перед действием)" max={60} onChange={v => set(i, { label: v })} />
            <label className="wcEdChk"><input type="checkbox" checked={it.mark} onChange={e => set(i, { mark: e.target.checked })} /> в вашей фразе</label>
            {b.items.length > 1 && <button className="wcEdMini" onClick={() => onChange({ items: b.items.filter((_, k) => k !== i) })} aria-label="Убрать случай">✕</button>}
          </div>
          <In value={it.example} placeholder="Пример: to + **cook**" max={120} onChange={v => set(i, { example: v })} />
          <In value={it.tr} placeholder="Перевод / пояснение" max={160} onChange={v => set(i, { tr: v })} />
        </div>
      ))}
      <div className="wcEdRow">
        <button className="wcEdBtn" disabled={b.items.length >= 4} onClick={() => onChange({ items: [...b.items, { label: '', example: '', tr: '', mark: false }] })}>＋ случай</button>
      </div>
    </>
  )
}
