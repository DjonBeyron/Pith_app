// Одна строка админского блока звука: подпись, число и ползунок (input range).
// Стили — styles/player/settings-sliders.css. touch-action: pan-y у строки,
// manipulation у ползунка — вертикальная прокрутка меню не ломается.
// hint — мелкая приписка под ползунком (например «усиление недоступно»)
export default function AudioSliderRow({ label, value, min, max, step, display, hint, onChange, onPointerDown }) {
  return (
    <div className="asRow">
      <div className="asHead">
        <span className="asLabel">{label}</span>
        <span className="asValue">{display}</span>
      </div>
      <input
        className="asRange"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onPointerDown={onPointerDown}
        onChange={e => onChange(Number(e.target.value))}
        style={{ '--as-fill': `${((value - min) / (max - min)) * 100}%` }}
      />
      {hint && <div className="asHint">{hint}</div>}
    </div>
  )
}
