// Ожидание внутри экрана повторения: тот же крутящийся кружок, что при
// открытии схемы модуля (.lessonsMapSpinner, lessons.css), и пояснение
export default function ReviewLoading({ text }) {
  return (
    <div className="reviewLoading" role="status">
      <span className="lessonsMapSpinner" />
      <p className="reviewLoadingText">{text}</p>
    </div>
  )
}
