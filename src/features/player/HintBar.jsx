import { HINT_LIMIT } from './useFinalHints.js'

// Панель подсказок Финала: три огонька под шапкой плеера. Раскрыл перевод
// сообщения — огонёк гаснет. Потратил больше трёх — панель переключается
// в состояние «билет не будет получен» (уроку это не мешает).
export default function HintBar({ count }) {
  const over = count > HINT_LIMIT
  return (
    <div className={`hintBar${over ? ' hintBarOver' : ''}`}>
      <span className="hintBarLabel">
        {over ? 'Подсказок больше трёх — билет не будет получен' : 'Подсказки'}
      </span>
      {!over && (
        <span className="hintBarLights">
          {Array.from({ length: HINT_LIMIT }, (_, i) => (
            <span key={i} className={`hintLight${i < count ? ' hintLightUsed' : ''}`} />
          ))}
        </span>
      )}
      {!over && <span className="hintBarTicket">🎟</span>}
    </div>
  )
}
