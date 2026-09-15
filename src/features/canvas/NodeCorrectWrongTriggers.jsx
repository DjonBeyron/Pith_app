// Пара портов «✓ Верно → / ✗ Неверно →» — общая разметка для table (ручной
// режим) и phrase_assembly: тот же блок дословно повторялся в
// NodeTablePicker.jsx и NodePhraseAssemblyPicker.jsx (см. NodeDistractorList.jsx
// с тем же поводом — оба файла упирались в потолок 400 строк из CLAUDE.md).
export default function NodeCorrectWrongTriggers({ correctThen, wrongThen, correctKey, wrongKey, onSetTrigger, otherNodes, rowRefs }) {
  return (
    <div className="nodeWcTriggerWrap">
      <div className="nodeWcTriggerRow" ref={el => rowRefs.current.set(correctKey, el)}>
        <span className="nodeWcTriggerLabel nodeWcTriggerLabelOk">✓ Верно →</span>
        <select
          className="nodeWcTriggerSelect"
          value={correctThen}
          onChange={e => onSetTrigger(correctKey, e.target.value)}
          onClick={e => e.stopPropagation()}
        >
          <option value="">—</option>
          {otherNodes.map(n => (
            <option key={n.id} value={n.id}>#{n.seq} {n.type}</option>
          ))}
        </select>
      </div>
      <div className="nodeWcTriggerRow" ref={el => rowRefs.current.set(wrongKey, el)}>
        <span className="nodeWcTriggerLabel nodeWcTriggerLabelErr">✗ Неверно →</span>
        <select
          className="nodeWcTriggerSelect"
          value={wrongThen}
          onChange={e => onSetTrigger(wrongKey, e.target.value)}
          onClick={e => e.stopPropagation()}
        >
          <option value="">—</option>
          {otherNodes.map(n => (
            <option key={n.id} value={n.id}>#{n.seq} {n.type}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
