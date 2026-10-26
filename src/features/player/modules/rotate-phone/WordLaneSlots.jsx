import { SLOTS } from './wordLaneTimeline.js'

// Три слоя на дорожках (шахматный порядок — координаты в wordLaneTimeline.SLOTS). filled — сколько слоёв уже залито; tone — чей цвет: coach (диктор, зелёный) или user (ученик, красный).
// Заливка — CSS-переход (transform) длиной --fill-ms (клип слоя в таймлайне ноды; по умолчанию 1 с), пустеют слои быстро. Лишнее слово ученика (misses растёт) — красная вспышка на ближайшем пустом слое: оверлей с key=misses перемонтируется
// и проигрывает анимацию заново, состояния для этого не нужно.
export default function WordLaneSlots({ word, tone, filled, misses, visible, fillMs }) {
  return SLOTS.map((p, i) => (
    <div
      key={i}
      className={`wlSlot wlSlot--${tone}${visible ? ' wlSlot--in' : ''}${i < filled ? ' wlSlot--filled' : ''}`}
      style={{ left: `${p.x}%`, top: `${p.y}%`, '--i': i, ...(tone === 'coach' && fillMs?.[i] ? { '--fill-ms': `${fillMs[i]}ms` } : null) }}
      data-testid={`wl-slot-${i}`}
    >
      <span className="wlFill" />
      <span className="wlSlotWord">{word}</span>
      {misses > 0 && i === filled && tone === 'user' && <span key={misses} className="wlMiss" />}
    </div>
  ))
}
