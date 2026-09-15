// Пикер «Сигналы ошибок» — общий для table (ручной режим) и phrase_assembly
// (см. PROJECT.md). У каждого слота ответа (слово/ячейка, см. signalSlots.js)
// можно назначить ноду-сигнал: она играет ОВЕРЛЕЕМ поверх панели, когда
// проверка находит ПЕРВОЕ неверное место именно в этом слоте — без сигнала
// работает обычный путь (общая подсказка responseWrong, попытка тратится).
//
// Интерфейс — тот же приём, что у «В ответ на» (replyToSeq) в
// NodeContentEditor.jsx и у особых переходов варианта (variantThen в
// NodePhraseAssemblyPicker.jsx/NodeTablePicker.jsx): выпадающий список нод
// урока. В отличие от replyToSeq сигнал не ограничен seq МЕНЬШЕ текущего —
// это отдельная нода-спутник, а не место в линейном порядке, ссылка вперёд
// тут не бракуется. Список — allNodes без самой этой ноды (otherNodes,
// как и у variantThen); сознательно НЕ фильтруем по типу и не прячем ноды,
// уже стоящие в основном потоке графа — автор сам решает, что использовать
// как сигнал (в т.ч. ноду, которая одновременно часть линейного сценария:
// решение задокументировано в PROJECT.md, «Сигналы ошибок»).
export default function NodeSignalsPicker({ slots, signals = [], onChange, otherNodes = [] }) {
  if (!slots.length) return null

  function refFor(slotIndex) {
    return signals.find(s => s.slot === slotIndex)?.ref ?? ''
  }

  function setRef(slotIndex, ref) {
    const rest = signals.filter(s => s.slot !== slotIndex)
    onChange(ref ? [...rest, { slot: slotIndex, ref }] : rest)
  }

  return (
    <div className="nodeSignalsWrap" onClick={e => e.stopPropagation()}>
      <p className="nodePaLabel">Сигналы ошибок (подсказка на конкретный слот)</p>
      {slots.map(slot => (
        <div key={slot.index} className="nodeWcTriggerRow">
          <span className="nodeWcTriggerLabel">
            слот {slot.index + 1}: {slot.label || '—'}
          </span>
          <select
            className="nodeWcTriggerSelect"
            value={refFor(slot.index)}
            onChange={e => setRef(slot.index, e.target.value)}
            onClick={e => e.stopPropagation()}
          >
            <option value="">— без сигнала —</option>
            {otherNodes.map(n => (
              <option key={n.id} value={n.id}>#{n.seq} {n.type}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
