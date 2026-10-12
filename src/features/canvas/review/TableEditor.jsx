import CopyIcon from './CopyIcon.jsx'

// Правка таблицы прямо в окне замечания: заголовок в чате, текст озвучки авто-таблицы и каждая ячейка (с иконкой «копировать»)
export default function TableEditor({ data, onPatch }) {
  const t = data.table ?? {}
  const cells = t.cells ?? []
  const cols = t.colCount ?? Math.max(1, ...cells.map(c => c.col + 1))
  const setCell = (id, value) => onPatch(d => ({ ...d, table: { ...d.table, cells: (d.table?.cells ?? []).map(c => (c.id === id ? { ...c, value } : c)) } }))
  const sorted = [...cells].sort((a, b) => a.row - b.row || a.col - b.col)
  return (
    <div className="rvwEdBlock">
      <label className="rvwEdLbl">Заголовок таблицы в чате <CopyIcon text={data.chatCaption ?? ''} /></label>
      <input className="rvwEdIn" value={data.chatCaption ?? ''} onChange={e => onPatch(d => ({ ...d, chatCaption: e.target.value }))} />
      {(data.mode === 'dictator' || data.script) && (
        <>
          <label className="rvwEdLbl">Текст озвучки (что говорит голос) <CopyIcon text={data.script ?? ''} /></label>
          <textarea className="rvwEdIn" rows={5} value={data.script ?? ''} onChange={e => onPatch(d => ({ ...d, script: e.target.value }))} />
        </>
      )}
      <div className="rvwEdLbl">Ячейки ({cells.length})</div>
      <div className="rvwEdGrid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {sorted.map(c => (
          <div key={c.id} className={`rvwEdCell${c.isHeader ? ' head' : ''}`}>
            <input value={c.value ?? ''} onChange={e => setCell(c.id, e.target.value)} />
            <CopyIcon text={c.value ?? ''} title="Скопировать ячейку" size={12} />
          </div>
        ))}
      </div>
    </div>
  )
}
