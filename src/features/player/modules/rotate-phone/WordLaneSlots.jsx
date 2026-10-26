import { SLOTS } from './wordLaneTimeline.js'

// Три слоя на дорожках (шахматный порядок — координаты в wordLaneTimeline.SLOTS). filled — сколько слоёв уже залито; tone — чей цвет: coach (диктор, зелёный) или user (ученик, красный).
// Заливка — CSS-переход (transform), пустеют слои быстро. Лишнее слово ученика (misses растёт) — красная вспышка на ближайшем пустом слое: оверлей с key=misses перемонтируется
// и проигрывает анимацию заново, состояния для этого не нужно.
export default function WordLaneSlots({ word, tone, filled, misses, visible }) {
  return SLOTS.map((p, i) => (
    <div
      key={i}
      className={`wlSlot wlSlot--${tone}${visible ? ' wlSlot--in' : ''}${i < filled ? ' wlSlot--filled' : ''}`}
      style={{ left: `${p.x}%`, top: `${p.y}%`, '--i': i }}
      data-testid={`wl-slot-${i}`}
    >
      <span className="wlFill" />
      <span className="wlSlotWord">{word}</span>
      {misses > 0 && i === filled && tone === 'user' && <span key={misses} className="wlMiss" />}
    </div>
  ))
}
