// Чекбокс «Получить награду» (⭐ XP) — общий для нод word_choice /
// phrase_assembly / photo_choice в max-режиме CanvasNode.
//
// lessonXp — XP САМОГО УРОКА (поле в шапке канваса, CanvasXpField). Галочка
// здесь решает только, кому достанется доля; сколько делить — берётся оттуда,
// и при нуле карта наград пуста вовсе (lessonXp.js: `if (!lessonXp) return
// new Map()`). Со стороны это выглядит противоречиво: галочка стоит, а на
// итогах урока «+0 XP» — потому что число живёт в другом месте. Поэтому
// вместо значка «⭐ XP» показываем предупреждение с подсказкой, где искать.
export default function NodeRewardCheckbox({ checked, onChange, lessonXp = 0 }) {
  const noLessonXp = checked && !lessonXp
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
      {checked && !noLessonXp && <span className="nodeRewardBadge">⭐ XP</span>}
      {noLessonXp && (
        <span
          className="nodeRewardWarn"
          title="XP урока не задан — поставь его в шапке канваса, рядом с кнопками «Граф» и «Продакшен». Пока там ноль, награду не получит ни одна нода, сколько бы галочек ни стояло."
        >⚠ у урока нет XP</span>
      )}
    </label>
  )
}
