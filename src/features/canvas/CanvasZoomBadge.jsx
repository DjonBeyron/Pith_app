// Масштаб в углу доски. Колесом легко потерять ощущение, где ты по зуму —
// число это сразу показывает, а клик возвращает 100%
export default function CanvasZoomBadge({ scale, onReset }) {
  return (
    <button
      className={`canvasZoomBadge${scale === 1 ? '' : ' canvasZoomBadgeOff'}`}
      onClick={onReset}
      title="Вернуть масштаб 100%"
    >
      {Math.round(scale * 100)}%
    </button>
  )
}
