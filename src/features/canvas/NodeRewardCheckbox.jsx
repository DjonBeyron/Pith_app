// Чекбокс «Получить награду» (⭐ XP) — общий для нод word_choice /
// phrase_assembly / photo_choice в max-режиме CanvasNode.
export default function NodeRewardCheckbox({ checked, onChange }) {
  return (
    <label
      className="nodeRewardCheckbox"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="nodeRewardLabel">Получить награду</span>
      {checked && <span className="nodeRewardBadge">⭐ XP</span>}
    </label>
  )
}
