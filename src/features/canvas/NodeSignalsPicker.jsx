import { useRef, useLayoutEffect } from 'react'

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
//
// Второй способ назначить сигнал — перетаскиваемый порт на холсте (см.
// CanvasSignalConnections.jsx/useCanvasSignalPortDrag.js): пишет то же самое
// поле signals, дропдаун здесь и порт на холсте — два входа в одни данные.
// Для этого строкам слотов нужны те же координаты, что и строкам триггеров
// «Тогда» (canvasPorts.js/triggerAnchor) — измеряем их тем же приёмом
// (rowRefs + useLayoutEffect), что NodePhraseAssemblyPicker.jsx/NodeTablePicker.jsx
// делают для своих строк, и поднимаем офсеты наверх через onSignalMeasure.
export default function NodeSignalsPicker({ slots, signals = [], onChange, otherNodes = [], onSignalMeasure }) {
  const rowRefs = useRef(new Map())

  // Хук должен вызываться безусловно (до раннего return ниже) — иначе при
  // первом появлении слотов (slots.length: 0 → N) React увидел бы новый
  // порядок хуков между рендерами
  useLayoutEffect(() => {
    if (!onSignalMeasure) return
    const offsets = slots.map(slot => {
      const el = rowRefs.current.get(slot.index)
      if (!el) return 0
      return el.offsetTop + el.offsetHeight / 2
    })
    onSignalMeasure(offsets)
  })

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
        <div key={slot.index} className="nodeWcTriggerRow" ref={el => rowRefs.current.set(slot.index, el)}>
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
