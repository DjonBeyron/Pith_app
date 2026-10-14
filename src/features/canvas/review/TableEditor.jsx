import EdField from './EdField.jsx'

// Правка таблицы прямо в окне замечания: заголовок в чате, текст озвучки авто-таблицы и каждая ячейка (с иконкой «копировать»).
// Все поля с локальным значением и отложенной записью — набор без лагов
export default function TableEditor({ data, onPatch, reg, ro = false }) {
  const t = data.table ?? {}
  const cells = t.cells ?? []
  const cols = t.colCount ?? Math.max(1, ...cells.map(c => c.col + 1))
  const sorted = [...cells].sort((a, b) => a.row - b.row || a.col - b.col)
  const common = { ro, reg, onPatch }
  return (
    <div className="rvwEdBlock">
      <EdField {...common} label="Заголовок таблицы в чате" value={data.chatCaption ?? ''} apply={v => d => ({ ...d, chatCaption: v })} />
      {(data.mode === 'dictator' || data.script) && (
        <EdField {...common} label="Текст озвучки (что говорит голос)" value={data.script ?? ''} rows={5} apply={v => d => ({ ...d, script: v })} />
      )}
      <div className="rvwEdLbl">Ячейки ({cells.length})</div>
      <div className="rvwEdGrid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {sorted.map(c => (
          <div key={c.id} className={`rvwEdCell${c.isHeader ? ' head' : ''}`}>
            <EdField {...common} cell value={c.value ?? ''} apply={v => d => ({ ...d, table: { ...d.table, cells: (d.table?.cells ?? []).map(x => (x.id === c.id ? { ...x, value: v } : x)) } })} />
          </div>
        ))}
      </div>
    </div>
  )
}
