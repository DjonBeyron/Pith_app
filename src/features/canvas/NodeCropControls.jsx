// Панель под рамкой кадрирования: − / процент / + / «сбросить» (классы mediaCrop*, crop.css) и, если
// задан slider, ползунок масштаба. Общая для NodeMediaCrop и NodeSceneCrop; логика жестов — useCropGestures.js.
export default function NodeCropControls({ scale, onZoom, onReset, slider = null }) {
  return (
    <div className="mediaCropControls">
      <button type="button" className="mediaCropZoomBtn" aria-label="Уменьшить" onClick={() => onZoom(0.85)}>−</button>
      {slider && (
        <input
          type="range" className="mediaCropRange" aria-label="Масштаб" min={slider.min} max={slider.max} step={slider.step ?? 0.05}
          value={scale} onChange={e => slider.onChange(Number(e.target.value))}
        />
      )}
      <span className="mediaCropScaleLabel">{Math.round(scale * 100)}%</span>
      <button type="button" className="mediaCropZoomBtn" aria-label="Увеличить" onClick={() => onZoom(1.18)}>+</button>
      <button type="button" className="mediaCropResetBtn" onClick={onReset}>сбросить</button>
    </div>
  )
}
