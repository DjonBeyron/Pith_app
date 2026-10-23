// Пара портов «✓ Верно → / ✗ Неверно →» — общая разметка для table (ручной
// режим) и phrase_assembly: тот же блок дословно повторялся в
// NodeTablePicker.jsx и NodePhraseAssemblyPicker.jsx (см. NodeDistractorList.jsx
// с тем же поводом — оба файла упирались в потолок 400 строк из CLAUDE.md).
// okLabel/errLabel — свои подписи портов.
import NodeSelect from './NodeSelect.jsx'

export default function NodeCorrectWrongTriggers({ correctThen, wrongThen, correctKey, wrongKey, onSetTrigger, otherNodes, rowRefs, okLabel = '✓ Верно →', errLabel = '✗ Неверно →' }) {
  return (
    <div className="nodeWcTriggerWrap">
      <div className="nodeWcTriggerRow" ref={el => rowRefs.current.set(correctKey, el)}>
        <span className="nodeWcTriggerLabel nodeWcTriggerLabelOk">{okLabel}</span>
        <NodeSelect className="nodeWcTriggerSelect" value={correctThen} onChange={e => onSetTrigger(correctKey, e.target.value)} emptyLabel="—" nodes={otherNodes} />
      </div>
      <div className="nodeWcTriggerRow" ref={el => rowRefs.current.set(wrongKey, el)}>
        <span className="nodeWcTriggerLabel nodeWcTriggerLabelErr">{errLabel}</span>
        <NodeSelect className="nodeWcTriggerSelect" value={wrongThen} onChange={e => onSetTrigger(wrongKey, e.target.value)} emptyLabel="—" nodes={otherNodes} />
      </div>
    </div>
  )
}
