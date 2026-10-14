import { slotGroups, slotsFilled } from './slotRules.js'
import SlotCell from './SlotCell.jsx'

// Сетка ячеек-слотов локации: две группы — свои слоты локации и общие. Каждая ячейка —
// SlotCell (выпадающий выбор совместимого предмета с мини-превью). Недоступные по needs
// (на столе без стола) заблокированы с пояснением (slotRules.js).
export default function SlotsGrid({ scene, onPick }) {
  const { common, local } = slotGroups(scene)
  const { filled, total } = slotsFilled(scene)
  return (
    <div className="scbSlots">
      <p className="scbSub">Занято {filled} из {total}. Пустая ячейка — ничего не рисуется.</p>
      <p className="scbGroupH">Слоты локации «{scene.location === 'cafe' ? 'Кафе' : 'Офис'}»</p>
      <div className="scbSlotGrid">
        {local.map(st => <SlotCell key={st.slot.id} state={st} onPick={onPick} />)}
      </div>
      <p className="scbGroupH">Общие слоты</p>
      <div className="scbSlotGrid">
        {common.map(st => <SlotCell key={st.slot.id} state={st} onPick={onPick} />)}
      </div>
    </div>
  )
}
