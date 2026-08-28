// Поле XP урока в шапке канваса. Вынесено из CanvasPage.jsx — тот упирался
// в потолок 400 строк, а этот кусок самодостаточен.
export default function CanvasXpField({ value, onChange }) {
  return (
    <div className="canvasXpField">
      <input
        className="canvasXpInput"
        type="number"
        min="0"
        step="10"
        value={value}
        onChange={e => {
          const n = Math.max(0, parseInt(e.target.value) || 0)
          // number-input не чистит ведущий ноль сам («05») — приводим DOM к числу
          e.target.value = String(n)
          onChange(n)
        }}
        onClick={e => e.stopPropagation()}
      />
      <span className="canvasXpLabel">XP</span>
    </div>
  )
}
