import { slotGroups, slotsFilled } from './slotRules.js'
import SlotCell from './SlotCell.jsx'
import Panel from './ui/Panel.jsx'

// Сетка ячеек-слотов локации: две вложенные сворачиваемые панели — свои слоты локации
// (ключ slots.local) и общие (slots.common). Каждая ячейка — SlotCell (выпадающий выбор
// совместимого предмета с мини-превью). Недоступные по needs (на столе без стола) заблокированы
// с пояснением (slotRules.js). Сетка подстраивается под ширину панели (auto-fill).
export default function SlotsGrid({ scene, onPick }) {
  const { common, local } = slotGroups(scene)
  const { filled, total } = slotsFilled(scene)
  return (
    <div className="scbSlots">
      <p className="scbSub">Занято {filled} из {total}. Пустая ячейка — ничего не рисуется.</p>
      <Panel id="slots.local" title={`Слоты локации «${scene.location === 'cafe' ? 'Кафе' : 'Офис'}»`} nested as="h3" fullscreenable={false}>
        <div className="scbSlotGrid">
          {local.map(st => <SlotCell key={st.slot.id} state={st} onPick={onPick} />)}
        </div>
      </Panel>
      <Panel id="slots.common" title="Общие слоты" nested as="h3" fullscreenable={false}>
        <div className="scbSlotGrid">
          {common.map(st => <SlotCell key={st.slot.id} state={st} onPick={onPick} />)}
        </div>
      </Panel>
    </div>
  )
}
