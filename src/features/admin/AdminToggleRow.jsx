// Строка-переключатель в шапке админки: название, подсказка и тумблер.
// Только внешний вид — что именно переключается, знает вызывающий.
// Подсказка меняется вместе с состоянием: в положении «включено» она говорит,
// что сейчас происходит, а не что произойдёт.
export default function AdminToggleRow({ title, on, hint, hintOn, disabled = false, onChange }) {
  return (
    <div className={`avToggle${on ? ' avToggleOn' : ''}`}>
      <div className="avToggleText">
        <span className="avToggleTitle">{title}</span>
        <span className="avToggleHint">{on ? (hintOn ?? hint) : hint}</span>
      </div>
      <label className="avToggleSwitch">
        <input
          type="checkbox"
          checked={on}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
        />
        <span className="avToggleTrack" />
      </label>
    </div>
  )
}
